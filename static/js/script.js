let isRecording = false;
let timerInterval = null;
let startTime = null;
let audioContext = null;
let lastAlertTime = 0; // 알림음 중복 방지

// 웹 오디오 API를 사용한 삐 소리 생성
function playAlert() {
    const settings = getSettings();
    if (!settings.enable_sound) return;

    // 알림음 중복 방지 (0.5초마다만 발생)
    const now = Date.now();
    if (now - lastAlertTime < 500) return;
    lastAlertTime = now;

    try {
        // AudioContext 초기화 (필요시)
        if (!audioContext) {
            audioContext = new (window.AudioContext || window.webkitAudioContext)();
        }

        // AudioContext가 suspended 상태면 resume
        if (audioContext.state === 'suspended') {
            audioContext.resume();
        }

        // 4가지 음으로 된 강력한 경고음
        const frequencies = [1000, 800, 1000, 800]; // 톤 다양성
        const duration = 0.15; // 각 톤의 길이
        
        frequencies.forEach((freq, index) => {
            try {
                const oscillator = audioContext.createOscillator();
                const gainNode = audioContext.createGain();

                oscillator.connect(gainNode);
                gainNode.connect(audioContext.destination);

                oscillator.frequency.value = freq;
                oscillator.type = 'sine';

                const startTime = audioContext.currentTime + (index * duration);
                gainNode.gain.setValueAtTime(0.4, startTime);
                gainNode.gain.exponentialRampToValueAtTime(0.01, startTime + duration);

                oscillator.start(startTime);
                oscillator.stop(startTime + duration);
            } catch (e) {
                console.log('오실레이터 생성 오류:', e);
            }
        });
    } catch (error) {
        console.log('알림음 생성 오류:', error);
        // 대체: 간단한 beep 음향
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
            console.log('대체 알림음도 실패:', e2);
        }
    }
}

// 설정 가져오기
function getSettings() {
    try {
        const soundToggle = document.getElementById('soundToggle');
        const flashingToggle = document.getElementById('flashingToggle');
        
        return {
            enable_sound: soundToggle ? soundToggle.checked : true,
            enable_flashing: flashingToggle ? flashingToggle.checked : true
        };
    } catch (error) {
        console.log('설정 가져오기 오류:', error);
        return {
            enable_sound: true,
            enable_flashing: true
        };
    }
}

// 설정 업데이트
async function updateSettings(settings) {
    try {
        const response = await fetch('/api/settings', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                enable_sound: settings.enable_sound,
                enable_flashing: settings.enable_flashing
            })
        });
    } catch (error) {
        console.error('설정 업데이트 오류:', error);
    }
}

// 설정 토글
async function toggleSettings(type) {
    const settings = getSettings();
    if (type === 'sound') {
        settings.enable_sound = document.getElementById('soundToggle').checked;
    } else if (type === 'flashing') {
        settings.enable_flashing = document.getElementById('flashingToggle').checked;
    }
    
    await updateSettings(settings);
}

// 임계값 업데이트
async function updateThreshold(type, value) {
    try {
        const data = {};
        
        if (type === 'sleep') {
            data.sleep_duration_threshold = parseInt(value);
            document.getElementById('sleepThresholdValue').textContent = value + '초';
        } else if (type === 'ear') {
            data.eye_closed_threshold = parseFloat(value);
            document.getElementById('earThresholdValue').textContent = parseFloat(value).toFixed(2);
        }
        
        const response = await fetch('/api/update_threshold', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(data)
        });
        
        if (response.ok) {
            console.log('임계값 업데이트 완료:', data);
        }
    } catch (error) {
        console.error('임계값 업데이트 오류:', error);
    }
}

// 녹화 시작
async function startRecording() {
    try {
        const response = await fetch('/api/start_recording', {
            method: 'POST'
        });

        if (response.ok) {
            isRecording = true;
            startTime = new Date();

            // UI 업데이트
            document.getElementById('startBtn').disabled = true;
            document.getElementById('stopBtn').disabled = false;
            document.getElementById('resultBtn').disabled = true;
            document.getElementById('statusBadge').setAttribute('class', 'status-badge recording');
            document.getElementById('statusBadge').textContent = '🔴 REC';

            // 타이머 시작
            startTimer();

            // 주기적으로 상태 업데이트
            updateStats();
        }
    } catch (error) {
        console.error('녹화 시작 오류:', error);
        alert('녹화를 시작할 수 없습니다.');
    }
}

// 녹화 중지
async function stopRecording() {
    try {
        const response = await fetch('/api/stop_recording', {
            method: 'POST'
        });

        if (response.ok) {
            const data = await response.json();
            isRecording = false;

            // UI 업데이트
            document.getElementById('startBtn').disabled = false;
            document.getElementById('stopBtn').disabled = true;
            document.getElementById('resultBtn').disabled = false;
            document.getElementById('statusBadge').setAttribute('class', 'status-badge');
            document.getElementById('statusBadge').textContent = 'COMPLETE';

            // 타이머 중지
            if (timerInterval) {
                clearInterval(timerInterval);
            }

            // 최종 통계 표시
            displayFinalStats(data);
        }
    } catch (error) {
        console.error('녹화 중지 오류:', error);
        alert('녹화를 중지할 수 없습니다.');
    }
}

// 타이머
function startTimer() {
    let elapsed = 0;
    timerInterval = setInterval(() => {
        elapsed++;
        const hours = Math.floor(elapsed / 3600);
        const minutes = Math.floor((elapsed % 3600) / 60);
        const seconds = elapsed % 60;

        const formatted = `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
        document.getElementById('timer').textContent = formatted;
    }, 1000);
}

// 통계 업데이트
async function updateStats() {
    if (!isRecording) return;

    try {
        const response = await fetch('/api/status');
        const data = await response.json();

        if (data.elapsed_time !== undefined) {
            // 총 시간
            const totalSecs = Math.floor(data.elapsed_time);
            const totalMins = Math.floor(totalSecs / 60);
            const totalHours = Math.floor(totalMins / 60);
            const displayTotal = totalHours > 0 
                ? `${totalHours}시간 ${totalMins % 60}분` 
                : totalMins > 0
                ? `${totalMins}분 ${totalSecs % 60}초`
                : `${totalSecs}초`;
            document.getElementById('totalTime').textContent = displayTotal;

            // 수면 시간
            const sleepSecs = Math.floor(data.total_sleep_seconds);
            const sleepMins = Math.floor(sleepSecs / 60);
            const sleepHours = Math.floor(sleepMins / 60);
            const displaySleep = sleepHours > 0 
                ? `${sleepHours}시간 ${sleepMins % 60}분` 
                : sleepMins > 0
                ? `${sleepMins}분 ${sleepSecs % 60}초`
                : `${sleepSecs}초`;
            document.getElementById('sleepTime').textContent = displaySleep;

            // 수면률
            const sleepPercent = totalSecs > 0 ? Math.round((sleepSecs / totalSecs) * 100) : 0;
            document.getElementById('sleepPercent').textContent = `${sleepPercent}%`;

            // 수면 감지 시 경고음 재생
            if (data.is_sleeping) {
                playAlert();
            }
        }

        // 다음 업데이트 예약
        if (isRecording) {
            setTimeout(updateStats, 1000);
        }
    } catch (error) {
        console.error('통계 업데이트 오류:', error);
        if (isRecording) {
            setTimeout(updateStats, 5000); // 오류 시 5초 후 재시도
        }
    }
}

// 최종 통계 표시
function displayFinalStats(data) {
    const totalSecs = Math.floor(data.total_duration);
    const sleepSecs = Math.floor(data.total_sleep_seconds);

    // 시간 포맷팅
    const formatTime = (seconds) => {
        const hours = Math.floor(seconds / 3600);
        const mins = Math.floor((seconds % 3600) / 60);
        const secs = seconds % 60;
        return hours > 0 
            ? `${hours}시간 ${mins}분 ${secs}초`
            : mins > 0
            ? `${mins}분 ${secs}초`
            : `${secs}초`;
    };

    document.getElementById('totalTime').innerHTML = `
        <strong>${formatTime(totalSecs)}</strong> 중
    `;
    document.getElementById('sleepTime').innerHTML = `
        <strong>${formatTime(sleepSecs)}</strong> 수면
    `;
    document.getElementById('sleepPercent').innerHTML = `
        <strong>${data.sleep_percentage}%</strong> 수면률
    `;

    // 결과 보기 버튼 활성화
    document.getElementById('resultBtn').disabled = false;
}

// 결과 페이지로 이동
async function goToResults() {
    window.location.href = '/results';
}

// 초기화
document.addEventListener('DOMContentLoaded', () => {
    // 초기 상태 설정
    document.getElementById('startBtn').disabled = false;
    document.getElementById('stopBtn').disabled = true;
    document.getElementById('resultBtn').disabled = true;

    // 토글 상태 초기화
    document.getElementById('soundToggle').checked = true;
    document.getElementById('flashingToggle').checked = true;

    updateSettings({
        enable_sound: true,
        enable_flashing: true
    });
});
