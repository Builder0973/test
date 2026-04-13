let chart = null;
let timeUnit = 'auto';

function formatTime(seconds, unit) {
    unit = unit || timeUnit || 'auto';
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);

    if (unit === 'seconds') {
        return `${Math.floor(seconds)}s`;
    } else if (unit === 'minutes') {
        const totalMinutes = Math.floor(seconds / 60);
        const remainingSecs = Math.floor(seconds % 60);
        return totalMinutes > 0 ? `${totalMinutes}m ${remainingSecs}s` : `${remainingSecs}s`;
    } else if (unit === 'hours') {
        return hours > 0
            ? `${hours}h ${minutes}m ${secs}s`
            : minutes > 0
            ? `${minutes}m ${secs}s`
            : `${secs}s`;
    } else {
        if (seconds >= 3600) return `${hours}h ${minutes}m ${secs}s`;
        if (seconds >= 60) return `${minutes}m ${secs}s`;
        return `${secs}s`;
    }
}

function formatDateTime(isoString) {
    const date = new Date(isoString);
    return date.toLocaleString('en-US', {
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
        document.querySelector('.results-content').innerHTML =
            '<p style="font-family: var(--font-mono); color: var(--text-muted); padding: 48px; text-align: center;">No session data available.</p>';
        return;
    }

    window.summaryData = summaryData;

    const totalDuration = summaryData.total_duration || 0;
    document.getElementById('totalDuration').textContent = formatTime(totalDuration, timeUnit);

    const totalSleep = summaryData.total_sleep_seconds || 0;
    document.getElementById('totalSleep').textContent = formatTime(totalSleep, timeUnit);

    const sleepPercentage = summaryData.sleep_percentage || 0;
    document.getElementById('sleepPercentage').textContent = `${sleepPercentage.toFixed(0)}%`;

    const awakeSeconds = totalDuration - totalSleep;
    document.getElementById('awakeTime').textContent = formatTime(awakeSeconds, timeUnit);

    document.getElementById('startTime').textContent = formatDateTime(summaryData.start_time);
    document.getElementById('endTime').textContent = formatDateTime(summaryData.end_time);

    displaySleepLog(summaryData.sleep_periods || []);
    createChart(totalDuration, totalSleep, awakeSeconds, sleepPercentage);
}

function displaySleepLog(sleepPeriods) {
    const logContainer = document.getElementById('sleepLog');

    if (!sleepPeriods || sleepPeriods.length === 0) {
        logContainer.innerHTML = '<p class="no-data">No sleep periods recorded during this session.</p>';
        return;
    }

    let html = '';
    sleepPeriods.forEach((period, index) => {
        html += `
            <div class="log-entry">
                <div class="log-entry-left">
                    <span class="log-index">Sleep Event ${index + 1}</span>
                    <span class="log-time">${formatDateTime(period.start)} &ndash; ${formatDateTime(period.end)}</span>
                </div>
                <div class="log-duration">${formatTime(period.duration, timeUnit)}</div>
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

        displaySleepLog(window.summaryData.sleep_periods || []);
    }
}

function createChart(totalDuration, totalSleep, awakeSeconds, sleepPercentage) {
    const ctx = document.getElementById('sleepChart').getContext('2d');

    if (chart) chart.destroy();

    chart = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: ['Sleep', 'Awake'],
            datasets: [{
                data: [totalSleep, awakeSeconds],
                backgroundColor: ['#FF4800', '#242424'],
                borderColor: '#0C0C0C',
                borderWidth: 3,
                hoverBackgroundColor: ['#FF5A14', '#2E2E2E']
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            cutout: '68%',
            plugins: {
                legend: {
                    position: 'bottom',
                    labels: {
                        color: '#999999',
                        font: {
                            family: 'DM Mono, monospace',
                            size: 12,
                            weight: '400'
                        },
                        padding: 24,
                        usePointStyle: true,
                        pointStyleWidth: 10
                    }
                },
                tooltip: {
                    backgroundColor: '#141414',
                    borderColor: '#242424',
                    borderWidth: 1,
                    titleColor: '#F0EBE3',
                    bodyColor: '#999999',
                    titleFont: { family: 'DM Mono, monospace', size: 11 },
                    bodyFont: { family: 'DM Mono, monospace', size: 12 },
                    callbacks: {
                        label: function(context) {
                            const label = context.label || '';
                            const value = context.parsed || 0;
                            const time = formatTime(value, timeUnit);
                            return `  ${label}: ${time}`;
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
        'Total Monitored': document.getElementById('totalDuration').textContent,
        'Total Sleep': document.getElementById('totalSleep').textContent,
        'Sleep Rate (%)': document.getElementById('sleepPercentage').textContent,
        'Awake Time': document.getElementById('awakeTime').textContent,
        'Session Start': document.getElementById('startTime').textContent,
        'Session End': document.getElementById('endTime').textContent,
        'Exported At': new Date().toLocaleString('en-US')
    };

    const csv = Object.entries(data)
        .map(([key, value]) => `${key},${value}`)
        .join('\n');

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);

    link.setAttribute('href', url);
    link.setAttribute('download', `sleep-detection-results_${new Date().getTime()}.csv`);
    link.style.visibility = 'hidden';

    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

document.addEventListener('DOMContentLoaded', () => {
    // summaryData and initializeResults() are called from the template
});
