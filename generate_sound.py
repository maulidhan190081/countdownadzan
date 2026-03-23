import wave
import math
import struct
import os

sample_rate = 44100
duration = 1.5

try:
    with wave.open('marimba_soft.wav', 'w') as f:
        f.setnchannels(1)
        f.setsampwidth(2)
        f.setframerate(sample_rate)
        
        for i in range(int(sample_rate * duration)):
            t = float(i) / sample_rate
            # A soft marimba-like bell tone
            freq = 660.0 # E5
            env = math.exp(-t * 5.0) # fast decay
            
            # Add some subtle marimba hollow harmonics
            val = env * (math.sin(2 * math.pi * freq * t) + 0.3 * math.sin(2 * math.pi * freq * 2.5 * t))
            
            sample = int(val * 0.4 * 32767)
            sample = max(-32768, min(32767, sample))
            f.writeframesraw(struct.pack('<h', sample))
    print("SUCCESS")
except Exception as e:
    print(f"FAILED: {e}")
