const elements = {
    locationText: document.getElementById('location-text'),
    gregorianDate: document.getElementById('gregorian-date'),
    hijriDate: document.getElementById('hijri-date'),
    nextPrayerName: document.getElementById('next-prayer-name'),
    timerDisplay: document.getElementById('time-remaining'),
    nextPrayerTimeVal: document.getElementById('next-prayer-time-val'),
    progressCircle: document.getElementById('progress-circle'),
    statusMessage: document.getElementById('status-message'),
    prayerCards: document.querySelectorAll('.prayer-card'),
    themeToggle: document.getElementById('theme-toggle'),
    audio: document.getElementById('final-countdown-audio'),
    sunriseTime: document.getElementById('time-sunrise'),
    qiblaDir: document.getElementById('qibla-direction'),
    
    // Compass Elements
    homeView: document.getElementById('home-view'),
    compassView: document.getElementById('compass-view'),
    qiblaCard: document.getElementById('qibla-card'),
    backToHomeBtn: document.getElementById('back-to-home-btn'),
    compassCircle: document.getElementById('compass-circle'),
    qiblaArrow: document.getElementById('qibla-arrow'),
    qiblaDegreeDisplay: document.getElementById('qibla-degree-display'),
    compassSensorStatus: document.getElementById('compass-sensor-status')
};

let currentQiblaDegree = 0;

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

let backgroundTimerWorker = null;
let isAdzanTriggered = false;

function initBackgroundTimer() {
    const workerBlob = new Blob([`
        let interval;
        self.onmessage = function(e) {
            if (e.data.action === 'START') {
                clearInterval(interval);
                const targetTime = e.data.targetTime;
                interval = setInterval(() => {
                    if (Date.now() >= targetTime) {
                        clearInterval(interval);
                        self.postMessage({ action: 'TIME_UP' });
                    }
                }, 1000);
            } else if (e.data.action === 'STOP') {
                clearInterval(interval);
            }
        };
    `], { type: 'application/javascript' });
    
    backgroundTimerWorker = new Worker(URL.createObjectURL(workerBlob));
    
    backgroundTimerWorker.onmessage = function(e) {
        if (e.data.action === 'TIME_UP') triggerAdzanAlarm();
    };
}

function requestNotificationPermission() {
    if ('Notification' in window && Notification.permission !== 'granted' && Notification.permission !== 'denied') {
        Notification.requestPermission();
    }
}

function triggerAdzanAlarm() {
    if (isAdzanTriggered || !nextPrayerObj) return;
    isAdzanTriggered = true;
    
    cancelAnimationFrame(countdownInterval);
    if (backgroundTimerWorker) {
        backgroundTimerWorker.postMessage({ action: 'STOP' });
    }
    
    elements.timerDisplay.innerHTML = "Waktunya<br>Adzan!";
    elements.timerDisplay.classList.add('time-up-text');
    setProgress(100);
    
    if (elements.audio) {
        elements.audio.play().catch(e => console.warn("Browser maybe blocked autoplay:", e));
    }
    
    const contentDiv = document.querySelector('.countdown-content');
    contentDiv.classList.add('is-adzan');
    elements.nextPrayerName.innerText = PRAYER_NAMES[nextPrayerObj.key].toUpperCase();
    
    document.querySelector('.next-prayer-time').style.display = 'block';
    
    let dismissText = document.getElementById('dismiss-text');
    if (!dismissText) {
        dismissText = document.createElement('div');
        dismissText.id = 'dismiss-text';
        dismissText.className = 'dismiss-text';
        dismissText.innerHTML = '<i class="fa-solid fa-hand-pointer"></i> Ketuk mematikan';
        contentDiv.appendChild(dismissText);
    }
    dismissText.style.display = 'flex';
    
    if ('Notification' in window && Notification.permission === 'granted') {
        navigator.serviceWorker.ready.then(reg => {
            reg.showNotification(`Waktunya Adzan ${PRAYER_NAMES[nextPrayerObj.key]}`, {
                body: 'Klik untuk membuka aplikasi dan mendengarkan Adzan.',
                icon: 'assets/gambar/favicon.png',
                vibrate: [200, 100, 200, 100, 200, 100, 200],
                tag: 'adzan-notification',
                requireInteraction: true
            });
        });
    }

    const stopAlarm = () => {
        document.removeEventListener('click', stopAlarm);
        isManualSelection = false;
        
        contentDiv.classList.remove('is-adzan');
        document.querySelector('.next-prayer-time').style.display = 'block';
        if (dismissText) dismissText.style.display = 'none';
        
        startCountdown(); // This automatically pauses audio and resets UI
    };
    
    setTimeout(() => {
        document.addEventListener('click', stopAlarm);
    }, 500);
}

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
    restoreCache();
    
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('sw.js').catch(e => console.warn('SW failed:', e));
        navigator.serviceWorker.addEventListener('message', event => {
            if (event.data.action === 'PLAY_AUDIO' && elements.audio) {
                elements.audio.currentTime = 0;
                elements.audio.play().catch(e => console.warn(e));
            }
        });
    }
    
    startGPS();
}

function restoreCache() {
    const cachedTimings = localStorage.getItem('cachedTimings');
    const cachedData = localStorage.getItem('cachedIslamicData');
    const cachedLoc = localStorage.getItem('cachedLocationName');
    
    if(cachedTimings && cachedData && cachedLoc) {
        elements.locationText.innerText = cachedLoc;
        timings = JSON.parse(cachedTimings);
        const islamicData = JSON.parse(cachedData);
        updateIslamicInfo(islamicData, localStorage.getItem('cachedLat'), localStorage.getItem('cachedLng'));
        updateScheduleUI();
        startCountdown();
        elements.statusMessage.innerText = "Menyelaraskan detik ke satelit...";
    }
}

function startGPS() {
    if(!localStorage.getItem('cachedLocationName')) {
        elements.locationText.innerText = "Mencari lokasi...";
    }
    
    if ("geolocation" in navigator) {
        navigator.geolocation.getCurrentPosition(
            async position => {
                const { latitude, longitude } = position.coords;
                await fetchLocationName(latitude, longitude);
                await fetchPrayerTimes(latitude, longitude);
            },
            error => {
                console.warn("Geolocation denied or error", error);
                elements.locationText.innerText = "Jakarta (Default)";
                elements.statusMessage.innerText = "Akses lokasi ditolak, menggunakan fallback.";
                fetchPrayerTimes("-6.2088", "106.8456");
            },
            { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
        );
    } else {
        elements.locationText.innerText = "Jakarta (Default)";
        elements.statusMessage.innerText = "Browser tidak mendukung geolokasi.";
        fetchPrayerTimes("-6.2088", "106.8456");
    }
}

function setDateInfo() {
    const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
    if (elements.gregorianDate) {
        elements.gregorianDate.innerText = new Date().toLocaleDateString('id-ID', options);
    }
}

function updateIslamicInfo(data, lat, lng) {
    if(data.date && data.date.hijri) {
        const hijri = data.date.hijri;
        if(elements.hijriDate) elements.hijriDate.innerText = `${hijri.day} ${hijri.month.en} ${hijri.year} H`;
    }
    if(data.timings) {
        if(elements.sunriseTime) elements.sunriseTime.innerText = data.timings.Sunrise.split(' ')[0];
    }
    
    if(elements.qiblaDir) {
        const cachedQibla = localStorage.getItem('cachedQiblaDegree');
        if(cachedQibla) {
            currentQiblaDegree = parseFloat(cachedQibla);
            const degText = currentQiblaDegree.toFixed(1) + "°";
            elements.qiblaDir.innerText = degText;
            if(elements.qiblaDegreeDisplay) elements.qiblaDegreeDisplay.innerText = degText;
            if(elements.qiblaArrow) elements.qiblaArrow.style.transform = `translate(-50%, -50%) rotate(${currentQiblaDegree}deg)`;
        }
        
        fetch(`https://api.aladhan.com/v1/qibla/${lat}/${lng}`)
            .then(res => res.json())
            .then(qdata => {
                if(qdata.code === 200) {
                    currentQiblaDegree = qdata.data.direction;
                    localStorage.setItem('cachedQiblaDegree', currentQiblaDegree);
                    const degText = currentQiblaDegree.toFixed(1) + "°";
                    elements.qiblaDir.innerText = degText;
                    if(elements.qiblaDegreeDisplay) elements.qiblaDegreeDisplay.innerText = degText;
                    if(elements.qiblaArrow) elements.qiblaArrow.style.transform = `translate(-50%, -50%) rotate(${currentQiblaDegree}deg)`;
                }
            }).catch(e => console.warn(e));
    }
}

async function fetchLocationName(lat, lng) {
    try {
        const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}`);
        const data = await res.json();
        let city = data.address.city || data.address.town || data.address.village || data.address.county || "Lokasi Anda";
        elements.locationText.innerText = city;
        localStorage.setItem('cachedLocationName', city);
    } catch(e) {
        console.error("Failed to fetch location name", e);
        if(!localStorage.getItem('cachedLocationName')) elements.locationText.innerText = "Satelit GPS";
    }
}

async function fetchPrayerTimes(lat, lng) {
    try {
        const res = await fetch(`https://api.aladhan.com/v1/timings?latitude=${lat}&longitude=${lng}&method=20`);
        const data = await res.json();
        
        if (data.code === 200) {
            timings = data.data.timings;
            // Menyimpan memori jadwal untuk muat ulang instan berikutnya
            localStorage.setItem('cachedTimings', JSON.stringify(timings));
            localStorage.setItem('cachedIslamicData', JSON.stringify(data.data));
            localStorage.setItem('cachedLat', lat);
            localStorage.setItem('cachedLng', lng);
            
            updateIslamicInfo(data.data, lat, lng);
            updateScheduleUI();
            startCountdown();
            const verifiedBadgeSVG = '<img src="assets/gambar/verified.png" alt="Verified" style="width: 18px; height: 18px; vertical-align: text-bottom; margin-left: 4px; filter: drop-shadow(0 2px 4px rgba(0,0,0,0.3));">';
            elements.statusMessage.innerHTML = `Jadwal adzan termutakhirkan ${verifiedBadgeSVG}`;
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
    isAdzanTriggered = false;
    if (!backgroundTimerWorker) initBackgroundTimer();
    
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

    if (backgroundTimerWorker) {
        backgroundTimerWorker.postMessage({ action: 'START', targetTime: nextPrayerObj.date.getTime() });
    }

    elements.nextPrayerName.innerText = PRAYER_NAMES[nextPrayerObj.key].toUpperCase();
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
            triggerAdzanAlarm();
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

    // Ask for notification permission on first interaction
    document.addEventListener('click', requestNotificationPermission, { once: true });

    const testBtn = document.getElementById('test-adzan-btn');
    if (testBtn) {
        testBtn.addEventListener('click', () => {
            if (nextPrayerObj) nextPrayerObj.date = new Date();
        });
    }
    
    // Compass View Navigation
    if (elements.qiblaCard) {
        elements.qiblaCard.addEventListener('click', () => {
            if(elements.homeView) elements.homeView.style.display = 'none';
            if(elements.compassView) {
                elements.compassView.style.display = 'flex';
                elements.compassView.classList.remove('fade-in');
                void elements.compassView.offsetWidth; 
                elements.compassView.classList.add('fade-in');
            }
            startCompassSensor();
        });
    }
    
    if (elements.backToHomeBtn) {
        elements.backToHomeBtn.addEventListener('click', () => {
            if(elements.compassView) elements.compassView.style.display = 'none';
            if(elements.homeView) {
                elements.homeView.style.display = 'block';
                elements.homeView.classList.remove('fade-in');
                void elements.homeView.offsetWidth; 
                elements.homeView.classList.add('fade-in');
            }
            stopCompassSensor();
        });
    }
});

// Device Orientation Handling for Compass
function handleOrientation(event) {
    let heading = null;
    if (event.webkitCompassHeading) {
        heading = event.webkitCompassHeading; // iOS 
    } else if (event.absolute && event.alpha != null) {
        heading = 360 - event.alpha; // Android Absolute
    }

    if (heading != null) {
        elements.compassSensorStatus.innerText = "Satelit Sensor Kompas Aktif \u2713";
        elements.compassSensorStatus.style.color = "#10b981";
        // Rotate outer compass to point physical North
        elements.compassCircle.style.transform = `rotate(${-heading}deg)`;
    } else {
        elements.compassSensorStatus.innerText = "Ponsel Anda menyediakan data sensor, tetapi tidak ada fitur kompas magnetik (Kalkulasi statis).";
        elements.compassSensorStatus.style.color = "#f59e0b";
    }
}

function startCompassSensor() {
    if (typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function') {
        // iOS 13+ devices require explicit user permission gesture
        elements.compassSensorStatus.innerText = "Ketuk tulisan merah ini untuk memberi izin Sensor iOS.";
        elements.compassSensorStatus.style.color = "#ef4444";
        elements.compassSensorStatus.onclick = () => {
            DeviceOrientationEvent.requestPermission()
                .then(permissionState => {
                    if (permissionState === 'granted') {
                        window.addEventListener('deviceorientation', handleOrientation, true);
                        elements.compassSensorStatus.onclick = null;
                    } else {
                        elements.compassSensorStatus.innerText = "Izin sensor ditolak.";
                    }
                })
                .catch(console.error);
        };
    } else if (window.DeviceOrientationEvent) {
        // Non iOS 13+ devices
        window.addEventListener('deviceorientationabsolute', handleOrientation, true);
        window.addEventListener('deviceorientation', handleOrientation, true);
        elements.compassSensorStatus.innerText = "Membaca kompas magnetik ponsel Anda...";
    } else {
        elements.compassSensorStatus.innerText = "Browser perangkat/PC Anda tidak memiliki sensor giroskop kompas.";
    }
}

function stopCompassSensor() {
    window.removeEventListener('deviceorientation', handleOrientation, true);
    window.removeEventListener('deviceorientationabsolute', handleOrientation, true);
    // Reset compass physical rotation gently
    if(elements.compassCircle) elements.compassCircle.style.transform = `rotate(0deg)`;
}
