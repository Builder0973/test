let chart = null;
let timeUnit = 'auto'; // 'auto', 'seconds', 'minutes', 'hours'

function formatTime(seconds, unit = 'auto') {
    unit = unit || timeUnit || 'auto';
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);

    if (unit === 'seconds') {
        return `${Math.floor(seconds)}초`;
    } else if (unit === 'minutes') {
        const totalMinutes = Math.floor(seconds / 60);
        const remainingSecs = Math.floor(seconds % 60);
        return totalMinutes > 0 ? `${totalMinutes}분 ${remainingSecs}초` : `${remainingSecs}초`;
    } else if (unit === 'hours') {
        return hours > 0 ? `${hours}시간 ${minutes}분 ${secs}초` : (minutes > 0 ? `${minutes}분 ${secs}초` : `${secs}초`);
    } else {
        // auto: 자동 선택
        if (seconds >= 3600) {
            return `${hours}시간 ${minutes}분 ${secs}초`;
        } else if (seconds >= 60) {
            return `${minutes}분 ${secs}초`;
        } else {
            return `${secs}초`;
        }
    }
}

function formatDateTime(isoString) {
    const date = new Date(isoString);
    return date.toLocaleString('ko-KR', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
    });
}

function initializeResults(summaryData) {
    if (!summaryData || Object.keys(summaryData).length === 0) {
        document.querySelector('.results-content').innerHTML = '<p>데이터를 불러올 수 없습니다.</p>';
        return;
    }

    window.summaryData = summaryData; // 단위변경 시 사용
    
    // 총 모니터링 시간
    const totalDuration = summaryData.total_duration || 0;
    document.getElementById('totalDuration').textContent = formatTime(totalDuration, timeUnit);

    // 총 수면 시간
    const totalSleep = summaryData.total_sleep_seconds || 0;
    document.getElementById('totalSleep').textContent = formatTime(totalSleep, timeUnit);

    // 수면률
    const sleepPercentage = summaryData.sleep_percentage || 0;
    document.getElementById('sleepPercentage').textContent = `${sleepPercentage.toFixed(0)}%`;

    // 깨어있는 시간
    const awakeSeconds = totalDuration - totalSleep;
    document.getElementById('awakeTime').textContent = formatTime(awakeSeconds, timeUnit);

    // 시작 및 종료 시간
    document.getElementById('startTime').textContent = formatDateTime(summaryData.start_time);
    document.getElementById('endTime').textContent = formatDateTime(summaryData.end_time);

    // 수면 기간 로그
    displaySleepLog(summaryData.sleep_periods || []);

    // 차트 생성
    createChart(totalDuration, totalSleep, awakeSeconds, sleepPercentage);
}

function displaySleepLog(sleepPeriods) {
    const logContainer = document.getElementById('sleepLog');
    
    if (!sleepPeriods || sleepPeriods.length === 0) {
        logContainer.innerHTML = '<p class="log-entry" style="border: none; background: transparent;">수면 기간 없음</p>';
        return;
    }

    let html = '';
    sleepPeriods.forEach((period, index) => {
        const startTime = formatDateTime(period.start);
        const endTime = formatDateTime(period.end);
        const duration = formatTime(period.duration, timeUnit);

        html += `
            <div class="log-entry">
                <div>
                    <div class="log-time">📍 ${index + 1}번 수면</div>
                    <div class="log-time">${startTime} ~ ${endTime}</div>
                </div>
                <div class="log-duration">⏱️ ${duration}</div>
            </div>
        `;
    });

    logContainer.innerHTML = html;
}

function changeTimeUnit(unit) {
    timeUnit = unit;
    if (window.summaryData) {
        const totalDuration = window.summaryData.total_duration || 0;
        const totalSleep = window.summaryData.total_sleep_seconds || 0;
        const awakeSeconds = totalDuration - totalSleep;
        
        document.getElementById('totalDuration').textContent = formatTime(totalDuration, unit);
        document.getElementById('totalSleep').textContent = formatTime(totalSleep, unit);
        document.getElementById('awakeTime').textContent = formatTime(awakeSeconds, unit);
        
        // 로그 다시 그리기
        displaySleepLog(window.summaryData.sleep_periods || []);
    }
}

function createChart(totalDuration, totalSleep, awakeSeconds, sleepPercentage) {
    const ctx = document.getElementById('sleepChart').getContext('2d');

    // 차트가 이미 존재하면 제거
    if (chart) {
        chart.destroy();
    }

    chart = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: ['수면', '깨어있음'],
            datasets: [{
                data: [totalSleep, awakeSeconds],
                backgroundColor: [
                    '#ef4444',
                    '#10b981'
                ],
                borderColor: '#1e293b',
                borderWidth: 2
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'bottom',
                    labels: {
                        color: '#f1f5f9',
                        font: { size: 14, weight: 'bold' },
                        padding: 20
                    }
                },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            const label = context.label || '';
                            const value = context.parsed || 0;
                            const time = formatTime(value, timeUnit);
                            return `${label}: ${time}`;
                        }
                    }
                }
            }
        }
    });
}

function goBack() {
    window.location.href = '/';
}

function downloadResults() {
    const data = {
        총_모니터링_시간: document.getElementById('totalDuration').textContent,
        총_수면_시간: document.getElementById('totalSleep').textContent,
        수면률_퍼센트: document.getElementById('sleepPercentage').textContent,
        깨어있는_시간: document.getElementById('awakeTime').textContent,
        시작_시간: document.getElementById('startTime').textContent,
        종료_시간: document.getElementById('endTime').textContent,
        생성_시간: new Date().toLocaleString('ko-KR')
    };

    const csv = Object.entries(data)
        .map(([key, value]) => `${key},${value}`)
        .join('\n');

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);

    link.setAttribute('href', url);
    link.setAttribute('download', `수면감지결과_${new Date().getTime()}.csv`);
    link.style.visibility = 'hidden';

    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

// 페이지 로드 시 초기화
document.addEventListener('DOMContentLoaded', () => {
    // summaryData는 템플릿에서 전달됨
    // initializeResults(summaryData)는 템플릿에서 호출됨
});
