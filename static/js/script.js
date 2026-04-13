let isRecording = false;
let timerInterval = null;
let startTime = null;
let audioContext = null;
let lastAlertTime = 0;

// Generate alert beep via Web Audio API
function playAlert() {
    const settings = getSettings();
    if (!settings.enable_sound) return;

    const now = Date.now();
    if (now - lastAlertTime < 500) return;
    lastAlertTime = now;

    try {
        if (!audioContext) {
            audioContext = new (window.AudioContext || window.webkitAudioContext)();
        }

        if (audioContext.state === 'suspended') {
            audioContext.resume();
        }

        const frequencies = [1000, 800, 1000, 800];
        const duration = 0.15;

        frequencies.forEach((freq, index) => {
            try {
                const oscillator = audioContext.createOscillator();
                const gainNode = audioContext.createGain();

                oscillator.connect(gainNode);
                gainNode.connect(audioContext.destination);

                oscillator.frequency.value = freq;
                oscillator.type = 'sine';

                const t = audioContext.currentTime + (index * duration);
                gainNode.gain.setValueAtTime(0.4, t);
                gainNode.gain.exponentialRampToValueAtTime(0.01, t + duration);

                oscillator.start(t);
                oscillator.stop(t + duration);
            } catch (e) {
                console.log('Oscillator error:', e);
            }
        });
    } catch (error) {
        console.log('Audio alert error:', error);
        try {
            const osc = audioContext.createOscillator();
            const gain = audioContext.createGain();
            osc.connect(gain);
            gain.connect(audioContext.destination);
            osc.frequency.value = 800;
            gain.gain.setValueAtTime(0.5, audioContext.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.1);
            osc.start(audioContext.currentTime);
            osc.stop(audioContext.currentTime + 0.1);
        } catch (e2) {
            console.log('Fallback audio failed:', e2);
        }
    }
}

// Get current UI settings
function getSettings() {
    try {
        const soundToggle = document.getElementById('soundToggle');
        const flashingToggle = document.getElementById('flashingToggle');
        return {
            enable_sound: soundToggle ? soundToggle.checked : true,
            enable_flashing: flashingToggle ? flashingToggle.checked : true
        };
    } catch (error) {
        return { enable_sound: true, enable_flashing: true };
    }
}

// POST updated settings to server
async function updateSettings(settings) {
    try {
        await fetch('/api/settings', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                enable_sound: settings.enable_sound,
                enable_flashing: settings.enable_flashing
            })
        });
    } catch (error) {
        console.error('Settings update error:', error);
    }
}

// Toggle a specific setting
async function toggleSettings(type) {
    const settings = getSettings();
    if (type === 'sound') {
        settings.enable_sound = document.getElementById('soundToggle').checked;
    } else if (type === 'flashing') {
        settings.enable_flashing = document.getElementById('flashingToggle').checked;
    }
    await updateSettings(settings);
}

// Update detection thresholds
async function updateThreshold(type, value) {
    try {
        const data = {};

        if (type === 'sleep') {
            data.sleep_duration_threshold = parseInt(value);
            document.getElementById('sleepThresholdValue').textContent = value + 's';
        } else if (type === 'ear') {
            data.eye_closed_threshold = parseFloat(value);
            document.getElementById('earThresholdValue').textContent = parseFloat(value).toFixed(2);
        }

        const response = await fetch('/api/update_threshold', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });

        if (response.ok) {
            console.log('Threshold updated:', data);
        }
    } catch (error) {
        console.error('Threshold update error:', error);
    }
}

// Start recording session
async function startRecording() {
    try {
        const response = await fetch('/api/start_recording', { method: 'POST' });

        if (response.ok) {
            isRecording = true;
            startTime = new Date();

            document.getElementById('startBtn').disabled = true;
            document.getElementById('stopBtn').disabled = false;
            document.getElementById('resultBtn').disabled = true;

            const badge = document.getElementById('statusBadge');
            badge.className = 'status-badge recording';
            badge.textContent = 'REC';

            const timer = document.getElementById('timer');
            timer.classList.add('running');

            const dot = document.getElementById('statusDot');
            dot.className = 'status-dot active';
            document.getElementById('statusText').textContent = 'RECORDING';

            const label = document.getElementById('sessionLabel');
            if (label) label.textContent = 'SESSION ACTIVE';

            startTimer();
            updateStats();
        }
    } catch (error) {
        console.error('Start recording error:', error);
        alert('Unable to start recording.');
    }
}

// Stop recording session
async function stopRecording() {
    try {
        const response = await fetch('/api/stop_recording', { method: 'POST' });

        if (response.ok) {
            const data = await response.json();
            isRecording = false;

            document.getElementById('startBtn').disabled = false;
            document.getElementById('stopBtn').disabled = true;
            document.getElementById('resultBtn').disabled = false;

            const badge = document.getElementById('statusBadge');
            badge.className = 'status-badge';
            badge.textContent = 'COMPLETE';

            const timer = document.getElementById('timer');
            timer.classList.remove('running');

            const dot = document.getElementById('statusDot');
            dot.className = 'status-dot';
            document.getElementById('statusText').textContent = 'COMPLETE';

            const label = document.getElementById('sessionLabel');
            if (label) label.textContent = 'SESSION COMPLETE';

            if (timerInterval) clearInterval(timerInterval);

            displayFinalStats(data);
        }
    } catch (error) {
        console.error('Stop recording error:', error);
        alert('Unable to stop recording.');
    }
}

// Elapsed timer display
function startTimer() {
    let elapsed = 0;
    timerInterval = setInterval(() => {
        elapsed++;
        const hours = Math.floor(elapsed / 3600);
        const minutes = Math.floor((elapsed % 3600) / 60);
        const seconds = elapsed % 60;
        document.getElementById('timer').textContent =
            `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
    }, 1000);
}

// Poll live stats from server
async function updateStats() {
    if (!isRecording) return;

    try {
        const response = await fetch('/api/status');
        const data = await response.json();

        if (data.elapsed_time !== undefined) {
            const totalSecs = Math.floor(data.elapsed_time);
            document.getElementById('totalTime').textContent = formatShortTime(totalSecs);

            const sleepSecs = Math.floor(data.total_sleep_seconds);
            document.getElementById('sleepTime').textContent = formatShortTime(sleepSecs);

            const sleepPercent = totalSecs > 0 ? Math.round((sleepSecs / totalSecs) * 100) : 0;
            document.getElementById('sleepPercent').textContent = `${sleepPercent}%`;

            if (data.is_sleeping) {
                playAlert();
                document.getElementById('statusDot').className = 'status-dot sleeping';
                document.getElementById('statusText').textContent = 'SLEEP DETECTED';
            } else {
                document.getElementById('statusDot').className = 'status-dot active';
                document.getElementById('statusText').textContent = 'RECORDING';
            }
        }

        if (isRecording) setTimeout(updateStats, 1000);
    } catch (error) {
        console.error('Stats update error:', error);
        if (isRecording) setTimeout(updateStats, 5000);
    }
}

// Format seconds into short human-readable string
function formatShortTime(seconds) {
    const hours = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    if (hours > 0) return `${hours}h ${mins}m`;
    if (mins > 0) return `${mins}m ${secs}s`;
    return `${secs}s`;
}

// Display stats after session ends
function displayFinalStats(data) {
    const totalSecs = Math.floor(data.total_duration);
    const sleepSecs = Math.floor(data.total_sleep_seconds);

    document.getElementById('totalTime').textContent = formatShortTime(totalSecs);
    document.getElementById('sleepTime').textContent = formatShortTime(sleepSecs);
    document.getElementById('sleepPercent').textContent = `${data.sleep_percentage}%`;
    document.getElementById('resultBtn').disabled = false;
}

// Navigate to results page
async function goToResults() {
    window.location.href = '/results';
}

// Initialise on page load
document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('startBtn').disabled = false;
    document.getElementById('stopBtn').disabled = true;
    document.getElementById('resultBtn').disabled = true;
    document.getElementById('soundToggle').checked = true;
    document.getElementById('flashingToggle').checked = true;

    updateSettings({ enable_sound: true, enable_flashing: true });
});
