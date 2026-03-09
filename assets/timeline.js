(function () {
  var OWNER = 'SmoothSend';
  var REPO = 'status';
  var DAYS = 90;
  var DEGRADED_THRESHOLD = 5;
  var OUTAGE_THRESHOLD = 30;

  var groups = [
    { label: 'Core Infrastructure', services: ['API Gateway'] },
    { label: 'Production Relayers', services: ['Aptos Relayer (Mainnet)'] },
    { label: 'Experimental Relayers (Testnet)', services: ['EVM Relayer (Testnet)', 'Stellar Relayer (Testnet)'] }
  ];

  function getDayKey(date) {
    return date.toISOString().split('T')[0];
  }

  function getLast90Days() {
    var days = [];
    var now = new Date();
    for (var i = DAYS - 1; i >= 0; i--) {
      var d = new Date(now);
      d.setDate(now.getDate() - i);
      days.push(getDayKey(d));
    }
    return days;
  }

  function getBarStatus(minutesDown) {
    if (!minutesDown || minutesDown === 0) return 'operational';
    if (minutesDown < DEGRADED_THRESHOLD) return 'operational';
    if (minutesDown < OUTAGE_THRESHOLD) return 'degraded';
    return 'outage';
  }

  function getBarColor(status) {
    if (status === 'operational') return '#0066FF';
    if (status === 'degraded') return '#F5A623';
    return '#D0021B';
  }

  function getStatusLabel(svc) {
    if (svc.status === 'up') return 'Operational';
    if (svc.status === 'degraded') return 'Degraded';
    return 'Major Outage';
  }

  function getStatusColor(svc) {
    if (svc.status === 'up') return '#0066FF';
    if (svc.status === 'degraded') return '#F5A623';
    return '#D0021B';
  }

  function formatDateLong(dateStr) {
    var d = new Date(dateStr + 'T00:00:00');
    return d.toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' });
  }

  function formatDateShort(dateStr) {
    var d = new Date(dateStr + 'T00:00:00');
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }

  function formatDuration(mins) {
    var h = Math.floor(mins / 60);
    var m = Math.round(mins % 60);
    return h + ' hrs  ' + m + ' mins';
  }

  // Shared tooltip element
  var tooltip = null;
  var activeBar = null;

  function createTooltip() {
    tooltip = document.createElement('div');
    tooltip.className = 'ss-tooltip';
    tooltip.innerHTML = '<div class="ss-tooltip-date"></div><div class="ss-tooltip-status"></div>';
    document.body.appendChild(tooltip);
  }

  function showTooltip(bar, e) {
    if (!tooltip) createTooltip();
    activeBar = bar;

    var date = bar.getAttribute('data-day');
    var mins = parseFloat(bar.getAttribute('data-mins')) || 0;
    var status = getBarStatus(mins);
    var svcName = bar.getAttribute('data-svc');

    var dateStr = formatDateLong(date);
    var statusIcon, statusLabel, statusColor, detail;

    if (status === 'operational') {
      statusIcon = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#0066FF" stroke-width="2.5"><path d="M20 6L9 17l-5-5"/></svg>';
      statusLabel = 'No downtime recorded';
      statusColor = '#0066FF';
      detail = '';
    } else if (status === 'degraded') {
      statusIcon = '<svg width="14" height="14" viewBox="0 0 24 24" fill="#F5A623" stroke="none"><path d="M12 2L1 21h22L12 2zm0 4l7.5 13h-15L12 6z"/><path d="M12 10v4M12 16v1" stroke="#F5A623" stroke-width="2" fill="none"/></svg>';
      statusLabel = 'Partial outage';
      statusColor = '#F5A623';
      detail = formatDuration(mins);
    } else {
      statusIcon = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#D0021B" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><path d="M15 9l-6 6M9 9l6 6"/></svg>';
      statusLabel = 'Major outage';
      statusColor = '#D0021B';
      detail = formatDuration(mins);
    }

    var html = '<div class="ss-tooltip-date">' + dateStr + '</div>';
    html += '<div class="ss-tooltip-row">';
    html += '<span class="ss-tooltip-icon">' + statusIcon + '</span>';
    html += '<span class="ss-tooltip-label" style="color:' + statusColor + '">' + statusLabel + '</span>';
    if (detail) {
      html += '<span class="ss-tooltip-detail">' + detail + '</span>';
    }
    html += '</div>';
    if (svcName) {
      html += '<div class="ss-tooltip-svc">' + svcName + '</div>';
    }

    tooltip.innerHTML = html;
    tooltip.style.display = 'block';

    positionTooltip(bar);
  }

  function positionTooltip(bar) {
    var rect = bar.getBoundingClientRect();
    var tw = tooltip.offsetWidth;
    var th = tooltip.offsetHeight;

    var left = rect.left + rect.width / 2 - tw / 2;
    var top = rect.top - th - 10 + window.scrollY;

    if (left < 8) left = 8;
    if (left + tw > window.innerWidth - 8) left = window.innerWidth - tw - 8;
    if (top < window.scrollY + 8) {
      top = rect.bottom + 10 + window.scrollY;
    }

    tooltip.style.left = left + 'px';
    tooltip.style.top = top + 'px';
  }

  function hideTooltip() {
    if (tooltip) tooltip.style.display = 'none';
    activeBar = null;
  }

  function createTimeline(svc, days) {
    var down = svc.dailyMinutesDown || {};

    var card = document.createElement('div');
    card.className = 'ss-timeline-card';

    var header = document.createElement('div');
    header.className = 'ss-timeline-header';

    var name = document.createElement('span');
    name.className = 'ss-timeline-name';
    name.textContent = svc.name;

    var status = document.createElement('span');
    status.className = 'ss-timeline-status';
    status.style.color = getStatusColor(svc);
    status.textContent = getStatusLabel(svc);

    header.appendChild(name);
    header.appendChild(status);
    card.appendChild(header);

    var bars = document.createElement('div');
    bars.className = 'ss-timeline-bars';

    days.forEach(function (day) {
      var mins = down[day] || 0;
      var barStatus = getBarStatus(mins);
      var bar = document.createElement('div');
      bar.className = 'ss-bar ss-bar-' + barStatus;
      bar.style.backgroundColor = getBarColor(barStatus);
      bar.setAttribute('data-day', day);
      bar.setAttribute('data-mins', mins);
      bar.setAttribute('data-svc', svc.name);

      bar.addEventListener('mouseenter', function (e) { showTooltip(bar, e); });
      bar.addEventListener('mouseleave', hideTooltip);

      bars.appendChild(bar);
    });

    card.appendChild(bars);

    var legend = document.createElement('div');
    legend.className = 'ss-timeline-legend';

    var left = document.createElement('span');
    left.textContent = '90 days ago';

    var center = document.createElement('div');
    center.className = 'ss-timeline-center';
    var line1 = document.createElement('div');
    line1.className = 'ss-timeline-line';
    var uptimeSpan = document.createElement('span');
    uptimeSpan.className = 'ss-timeline-uptime';
    uptimeSpan.textContent = svc.uptime + ' uptime';
    var line2 = document.createElement('div');
    line2.className = 'ss-timeline-line';
    center.appendChild(line1);
    center.appendChild(uptimeSpan);
    center.appendChild(line2);

    var right = document.createElement('span');
    right.textContent = 'Today';

    legend.appendChild(left);
    legend.appendChild(center);
    legend.appendChild(right);
    card.appendChild(legend);

    return card;
  }

  function createGroupHeader(label) {
    var hdr = document.createElement('div');
    hdr.className = 'ss-group-header';
    hdr.textContent = label;
    return hdr;
  }

  function render(data) {
    var days = getLast90Days();

    var main = document.querySelector('main.container');
    if (!main) return;

    var liveStatus = main.querySelector('.live-status');
    if (!liveStatus) return;

    var wrapper = document.createElement('div');
    wrapper.className = 'ss-timeline-wrapper';
    wrapper.id = 'ss-custom-timeline';

    groups.forEach(function (group) {
      wrapper.appendChild(createGroupHeader(group.label));
      group.services.forEach(function (svcName) {
        var svc = data.find(function (s) { return s.name === svcName; });
        if (svc) wrapper.appendChild(createTimeline(svc, days));
      });
    });

    var existingSections = main.querySelectorAll('.live-status, .live-status ~ section');
    existingSections.forEach(function (el) { el.style.display = 'none'; });

    var h2parent = main.querySelector('.f.changed');
    if (h2parent) h2parent.style.display = 'none';

    var insertBefore = liveStatus;
    insertBefore.parentNode.insertBefore(wrapper, insertBefore);
  }

  function init() {
    fetch('https://raw.githubusercontent.com/' + OWNER + '/' + REPO + '/master/history/summary.json')
      .then(function (r) { return r.json(); })
      .then(function (data) {
        function tryRender() {
          var main = document.querySelector('main.container');
          var ls = main && main.querySelector('.live-status');
          if (ls && !document.getElementById('ss-custom-timeline')) {
            render(data);
          } else if (!document.getElementById('ss-custom-timeline')) {
            setTimeout(tryRender, 300);
          }
        }
        tryRender();
      })
      .catch(function (err) {
        console.error('SmoothSend timeline: failed to load summary', err);
      });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
