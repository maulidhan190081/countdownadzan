const elements = {
    locationText: document.getElementById('location-text'),
    dateText: document.getElementById('date-text'),
    nextPrayerName: document.getElementById('next-prayer-name'),
    timerDisplay: document.getElementById('time-remaining'),
    nextPrayerTimeVal: document.getElementById('next-prayer-time-val'),
    progressCircle: document.getElementById('progress-circle'),
    statusMessage: document.getElementById('status-message'),
    prayerCards: document.querySelectorAll('.prayer-card'),
    themeToggle: document.getElementById('theme-toggle'),
    audio: document.getElementById('final-countdown-audio')
};

const PRAYER_NAMES = {
    Fajr: "Subuh",
    Dhuhr: "Dzuhur",
    Asr: "Ashar",
    Maghrib: "Maghrib",
    Isha: "Isya"
};

const REQUIRED_PRAYERS = ['Fajr', 'Dhuhr', 'Asr', 'Maghrib', 'Isha'];

let timings = {};
let countdownInterval;
let nextPrayerObj = null;
let isManualSelection = false;

// Circle logic
const circleRadius = 140; // match CSS
const circleCircumference = 2 * Math.PI * circleRadius;
elements.progressCircle.style.strokeDasharray = `${circleCircumference} ${circleCircumference}`;
elements.progressCircle.style.strokeDashoffset = circleCircumference; // hidden initially

function setProgress(percent) {
    const offset = circleCircumference - (percent / 100) * circleCircumference;
    elements.progressCircle.style.strokeDashoffset = offset;
}

async function init() {
    setDateInfo();
    
    if ("geolocation" in navigator) {
        navigator.geolocation.getCurrentPosition(
            async position => {
                const { latitude, longitude } = position.coords;
                await fetchLocationName(latitude, longitude);
                await fetchPrayerTimes(latitude, longitude);
            },
            error => {
                console.warn("Geolocation denied or error", error);
                elements.locationText.innerText = "Lokasi: Jakarta (Default)";
                elements.statusMessage.innerText = "Akses lokasi ditolak, menggunakan fallback.";
                // Fallback to Jakarta
                fetchPrayerTimes("-6.2088", "106.8456");
            },
            { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
        );
    } else {
        elements.locationText.innerText = "Lokasi: Jakarta (Default)";
        elements.statusMessage.innerText = "Browser tidak mendukung geolokasi.";
        fetchPrayerTimes("-6.2088", "106.8456");
    }
}

function setDateInfo() {
    const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
    elements.dateText.innerText = new Date().toLocaleDateString('id-ID', options);
}

async function fetchLocationName(lat, lng) {
    try {
        const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}`);
        const data = await res.json();
        
        const area = data.address.suburb || data.address.village || "";
        const city = data.address.city || data.address.town || data.address.county || "";
        const locationName = [area, city].filter(Boolean).join(", ") || data.address.state || "Lokasi Ditemukan";
        
        elements.locationText.innerText = locationName;
    } catch (e) {
        console.error("Failed to fetch location name", e);
        elements.locationText.innerText = "Lokasi Ditemukan";
    }
}

async function fetchPrayerTimes(lat, lng) {
    try {
        // Method 11 is Majlis Ugama Islam Singapura, Method 20 is Kemenag.
        // We use method 20 specifically for Kemenag RI (Indonesia) for accurate times. 
        const dateStr = new Date().toISOString().split('T')[0].split('-').reverse().join('-');
        const response = await fetch(`https://api.aladhan.com/v1/timings/${dateStr}?latitude=${lat}&longitude=${lng}&method=20`);
        const data = await response.json();

        if (data.code === 200) {
            timings = data.data.timings;
            updateScheduleUI();
            startCountdown();
            elements.statusMessage.innerHTML = 'Jadwal adzan termutakhirkan <i class="fa-solid fa-circle-check status-verified-icon"></i>';
        } else {
            throw new Error("API returned non-200");
        }
    } catch (e) {
        console.error("Failed to fetch timings", e);
        elements.statusMessage.innerText = "Gagal mengambil jadwal waktu shalat.";
    }
}

function updateScheduleUI() {
    REQUIRED_PRAYERS.forEach(prayer => {
        const timeElement = document.getElementById(`time-${prayer.toLowerCase()}`);
        if (timeElement && timings[prayer]) {
            // Some apis return `04:30 (WIB)`, strip anything after space
            let cleanTime = timings[prayer].split(' ')[0];
            timeElement.innerText = cleanTime;
        }
    });
}

function parsePrayerTimeToDate(timeStr, addDays = 0) {
    const [hours, minutes] = timeStr.split(':');
    const d = new Date();
    d.setHours(parseInt(hours, 10), parseInt(minutes, 10), 0, 0);
    if (addDays > 0) {
        d.setDate(d.getDate() + addDays);
    }
    return d;
}

function findNextPrayer() {
    const now = new Date();
    let next = null;
    let minDiff = Infinity;
    
    // First, find today's next prayer
    for (const prayer of REQUIRED_PRAYERS) {
        const cleanTime = timings[prayer].split(' ')[0];
        const prayerDate = parsePrayerTimeToDate(cleanTime);
        const diff = prayerDate.getTime() - now.getTime();
        
        if (diff > 0 && diff < minDiff) {
            minDiff = diff;
            next = { key: prayer, time: cleanTime, date: prayerDate, isTomorrow: false };
        }
    }
    
    // If all today's prayers are passed, next is Fajr tomorrow
    if (!next) {
        const cleanTime = timings['Fajr'].split(' ')[0];
        const prayerDate = parsePrayerTimeToDate(cleanTime, 1);
        next = { key: 'Fajr', time: cleanTime, date: prayerDate, isTomorrow: true };
    }
    
    return next;
}

function getPreviousPrayerDate(nextKey, isTomorrow) {
    const index = REQUIRED_PRAYERS.indexOf(nextKey);
    let prevIndex = index - 1;
    let addDays = isTomorrow ? 1 : 0;
    
    if (prevIndex < 0) {
        prevIndex = REQUIRED_PRAYERS.length - 1;
        // if next is Fajr today (0), previous was Isha yesterday
        addDays -= 1; 
    }
    
    const prevKey = REQUIRED_PRAYERS[prevIndex];
    const cleanTime = timings[prevKey].split(' ')[0];
    return parsePrayerTimeToDate(cleanTime, addDays);
}

function startCountdown(manualNextPrayer = null) {
    if (countdownInterval) cancelAnimationFrame(countdownInterval);
    
    // Reset music if it was playing
    if (elements.audio) {
        elements.audio.pause();
        elements.audio.currentTime = 0;
    }

    elements.timerDisplay.classList.remove('time-up-text');

    if (manualNextPrayer) {
        nextPrayerObj = manualNextPrayer;
        isManualSelection = true;
    } else if (!isManualSelection) {
        nextPrayerObj = findNextPrayer();
    }

    if(!nextPrayerObj) return;

    elements.nextPrayerName.innerText = PRAYER_NAMES[nextPrayerObj.key];
    elements.nextPrayerTimeVal.innerText = nextPrayerObj.time;
    
    // Highlight active card
    elements.prayerCards.forEach(card => card.classList.remove('active'));
    const activeCard = document.querySelector(`.prayer-card[data-prayer="${nextPrayerObj.key}"]`);
    if(activeCard) activeCard.classList.add('active');

    const updateTimer = () => {
        // Use performance.now() to get microsecond precision for the most fluid UI update
        // We calculate elapsed since the reference timer start Date
        const currentMsDate = new Date().getTime();
        const diff = nextPrayerObj.date.getTime() - currentMsDate;
        
        if (diff <= 0) {
            // Time reached!
            cancelAnimationFrame(countdownInterval);
            elements.timerDisplay.innerHTML = "Waktunya<br>Adzan!";
            elements.timerDisplay.classList.add('time-up-text');
            setProgress(100);
            
            // Play final countdown audio
            if (elements.audio) {
                elements.audio.play().catch(e => console.warn("Browser maybe blocked autoplay:", e));
            }
            
            elements.timerDisplay.innerHTML = "Waktunya<br>Adzan!<br><span style='font-size: 0.35em; font-weight: 400; opacity: 0.8; display: block; margin-top: 8px; text-shadow: none;'>Ketuk untuk mematikan</span>";
            
            // Wait for user to click anywhere to stop the audio
            const stopAlarm = () => {
                document.removeEventListener('click', stopAlarm);
                isManualSelection = false;
                startCountdown(); // This automatically pauses audio and resets UI
            };
            
            // Small delay to prevent immediate trigger if user just clicked a button
            setTimeout(() => {
                document.addEventListener('click', stopAlarm);
            }, 500);
            return;
        }
        
        // Calculate hrs, mins, secs
        const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
        const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
        const seconds = Math.floor((diff % (1000 * 60)) / 1000);
        
        // Format strings
        const h = hours.toString().padStart(2, '0');
        const m = minutes.toString().padStart(2, '0');
        const s = seconds.toString().padStart(2, '0');
        
        // Hide hours if zero for cleaner look, but keep structural layout
        if (hours === 0) {
            elements.timerDisplay.innerText = `${m}:${s}`;
        } else {
            elements.timerDisplay.innerText = `${h}:${m}:${s}`;
        }

        // Calculate progress percentage with exact decimal differences
        let percentage = 0;
        
        // Find the actual real-world chronological previous prayer.
        // This ensures the progress bar scales beautifully from the last real prayer,
        // rather than starting at an empty 0% when manually clicked.
        const actualNext = findNextPrayer();
        if (actualNext) {
            const actualPrevDate = getPreviousPrayerDate(actualNext.key, actualNext.isTomorrow);
            
            const totalDuration = nextPrayerObj.date.getTime() - actualPrevDate.getTime();
            const elapsedTime = Date.now() - actualPrevDate.getTime();
            
            if (totalDuration > 0) {
                percentage = (elapsedTime / totalDuration) * 100;
            }
        }

        // Clamp between 0 and 100 to ensure circle never breaks
        percentage = Math.max(0, Math.min(100, percentage));
        
        setProgress(percentage);
        countdownInterval = requestAnimationFrame(updateTimer);
    };

    countdownInterval = requestAnimationFrame(updateTimer);
}

function setupManualSelection() {
    elements.prayerCards.forEach(card => {
        card.addEventListener('click', () => {
            const prayerKey = card.getAttribute('data-prayer');
            if (timings[prayerKey]) {
                const cleanTime = timings[prayerKey].split(' ')[0];
                const prayerDate = parsePrayerTimeToDate(cleanTime);
                
                // If the selected prayer is already passed for today, assume it's for tomorrow
                // to prevent the countdown from instantly saying "Waktunya Adzan!"
                let isTomorrow = false;
                if (prayerDate.getTime() <= new Date().getTime()) {
                    prayerDate.setDate(prayerDate.getDate() + 1);
                    isTomorrow = true;
                }

                const manualObj = {
                    key: prayerKey,
                    time: cleanTime,
                    date: prayerDate,
                    isTomorrow: isTomorrow
                };
                
                startCountdown(manualObj);
            }
        });
        card.style.cursor = 'pointer'; // Make it look clickable
    });
}

function initTheme() {
    const savedTheme = localStorage.getItem('theme');
    const isLightMode = savedTheme === 'light';
    
    if (isLightMode) {
        document.body.classList.add('light-mode');
        elements.themeToggle.innerHTML = '<i class="fa-solid fa-moon"></i>';
    }

    elements.themeToggle.addEventListener('click', () => {
        document.body.classList.toggle('light-mode');
        const isNowLight = document.body.classList.contains('light-mode');
        
        if (isNowLight) {
            localStorage.setItem('theme', 'light');
            elements.themeToggle.innerHTML = '<i class="fa-solid fa-moon"></i>';
        } else {
            localStorage.setItem('theme', 'dark');
            elements.themeToggle.innerHTML = '<i class="fa-solid fa-sun"></i>';
        }
    });
}

document.addEventListener('DOMContentLoaded', () => {
    init();
    setupManualSelection();
    initTheme();

    const testBtn = document.getElementById('test-adzan-btn');
    if (testBtn) {
        testBtn.addEventListener('click', () => {
            if (nextPrayerObj) nextPrayerObj.date = new Date();
        });
    }
});
