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

  var issuesByServiceDay = {};

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

  function formatDuration(mins) {
    var h = Math.floor(mins / 60);
    var m = Math.round(mins % 60);
    return h + ' hrs  ' + m + ' mins';
  }

  function matchServiceToIssue(issueTitle, serviceNames) {
    var t = issueTitle.toLowerCase();
    var matched = [];
    serviceNames.forEach(function (name) {
      var slug = name.toLowerCase().replace(/[()]/g, '').trim();
      var parts = slug.split(/\s+/);
      var keyPart = parts[0];
      if (t.indexOf(keyPart) !== -1) matched.push(name);
    });
    return matched;
  }

  function getDaysForIssue(issue) {
    var created = getDayKey(new Date(issue.created_at));
    var closed = issue.closed_at ? getDayKey(new Date(issue.closed_at)) : getDayKey(new Date());
    var days = [];
    var d = new Date(created + 'T00:00:00');
    var end = new Date(closed + 'T00:00:00');
    while (d <= end) {
      days.push(getDayKey(d));
      d.setDate(d.getDate() + 1);
    }
    return days;
  }

  var TRUSTED_AUTHORS = ['ivedmohan', 'upptime-bot', 'github-actions[bot]'];

  function fetchIssuesForLabel(label, serviceNames) {
    var url = 'https://api.github.com/repos/' + OWNER + '/' + REPO + '/issues?state=all&per_page=100&labels=' + label;
    return fetch(url)
      .then(function (r) { return r.json(); })
      .then(function (issues) {
        if (!Array.isArray(issues)) return;
        issues.forEach(function (issue) {
          if (issue.pull_request) return;

          var author = (issue.user && issue.user.login) || '';
          var authorAssoc = issue.author_association || '';
          var trusted = TRUSTED_AUTHORS.indexOf(author) !== -1
            || authorAssoc === 'OWNER'
            || authorAssoc === 'MEMBER'
            || authorAssoc === 'COLLABORATOR';
          if (!trusted) return;

          var matched = matchServiceToIssue(issue.title, serviceNames);
          var issueDays = getDaysForIssue(issue);
          if (matched.length === 0) matched = serviceNames;

          matched.forEach(function (svcName) {
            issueDays.forEach(function (day) {
              var key = svcName + '::' + day;
              if (!issuesByServiceDay[key]) issuesByServiceDay[key] = [];
              issuesByServiceDay[key].push({
                title: issue.title,
                type: label,
                url: issue.html_url,
                number: issue.number
              });
            });
          });
        });
      })
      .catch(function () {});
  }

  function fetchIssues(serviceNames) {
    return Promise.all([
      fetchIssuesForLabel('maintenance', serviceNames),
      fetchIssuesForLabel('incident', serviceNames)
    ]);
  }

  var tooltip = null;

  function createTooltip() {
    tooltip = document.createElement('div');
    tooltip.className = 'ss-tooltip';
    document.body.appendChild(tooltip);
  }

  function showTooltip(bar) {
    if (!tooltip) createTooltip();

    var date = bar.getAttribute('data-day');
    var mins = parseFloat(bar.getAttribute('data-mins')) || 0;
    var status = getBarStatus(mins);
    var svcName = bar.getAttribute('data-svc');
    var issueKey = svcName + '::' + date;
    var issues = issuesByServiceDay[issueKey] || [];

    var dateStr = formatDateLong(date);
    var statusIcon, statusLabel, statusColor, detail;

    if (status === 'operational' && issues.length === 0) {
      statusIcon = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#0066FF" stroke-width="2.5"><path d="M20 6L9 17l-5-5"/></svg>';
      statusLabel = 'No downtime recorded';
      statusColor = '#0066FF';
      detail = '';
    } else if (status === 'operational' && issues.length > 0) {
      var t = issues[0].type;
      if (t === 'maintenance') {
        statusIcon = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#0066FF" stroke-width="2"><path d="M14.7 6.3a1 1 0 000 1.4l1.6 1.6a1 1 0 001.4 0l3.77-3.77a6 6 0 01-7.94 7.94l-6.91 6.91a2.12 2.12 0 01-3-3l6.91-6.91a6 6 0 017.94-7.94l-3.76 3.76z"/></svg>';
        statusLabel = 'Scheduled maintenance';
        statusColor = '#0066FF';
      } else {
        statusIcon = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#F5A623" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0zM12 9v4M12 17h.01"/></svg>';
        statusLabel = 'Incident reported';
        statusColor = '#F5A623';
      }
      detail = '';
    } else if (status === 'degraded') {
      statusIcon = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#F5A623" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0zM12 9v4M12 17h.01"/></svg>';
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
    if (detail) html += '<span class="ss-tooltip-detail">' + detail + '</span>';
    html += '</div>';

    if (issues.length > 0) {
      html += '<div class="ss-tooltip-issues">';
      html += '<div class="ss-tooltip-issues-label">RELATED</div>';
      issues.forEach(function (iss) {
        var typeTag = iss.type === 'maintenance'
          ? '<span class="ss-issue-tag ss-issue-tag-maint">Maintenance</span>'
          : '<span class="ss-issue-tag ss-issue-tag-incident">Incident</span>';
        html += '<div class="ss-tooltip-issue">' + typeTag + ' ' + iss.title + '</div>';
      });
      html += '</div>';
    }

    html += '<div class="ss-tooltip-svc">' + svcName + '</div>';

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
    if (top < window.scrollY + 8) top = rect.bottom + 10 + window.scrollY;
    tooltip.style.left = left + 'px';
    tooltip.style.top = top + 'px';
  }

  function hideTooltip() {
    if (tooltip) tooltip.style.display = 'none';
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
      var issueKey = svc.name + '::' + day;
      var hasIssue = issuesByServiceDay[issueKey] && issuesByServiceDay[issueKey].length > 0;

      var bar = document.createElement('div');
      bar.className = 'ss-bar ss-bar-' + barStatus;

      if (hasIssue && barStatus === 'operational') {
        var issueType = issuesByServiceDay[issueKey][0].type;
        if (issueType === 'maintenance') {
          bar.style.backgroundColor = '#0066FF';
          bar.style.backgroundImage = 'repeating-linear-gradient(45deg,transparent,transparent 2px,rgba(255,255,255,0.15) 2px,rgba(255,255,255,0.15) 4px)';
        } else {
          bar.style.backgroundColor = '#F5A623';
        }
      } else {
        bar.style.backgroundColor = getBarColor(barStatus);
      }

      bar.setAttribute('data-day', day);
      bar.setAttribute('data-mins', mins);
      bar.setAttribute('data-svc', svc.name);

      bar.addEventListener('mouseenter', function () { showTooltip(bar); });
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

    liveStatus.parentNode.insertBefore(wrapper, liveStatus);
  }

  function init() {
    var allServices = [];
    groups.forEach(function (g) { allServices = allServices.concat(g.services); });

    Promise.all([
      fetch('https://raw.githubusercontent.com/' + OWNER + '/' + REPO + '/master/history/summary.json').then(function (r) { return r.json(); }),
      fetchIssues(allServices)
    ]).then(function (results) {
      var data = results[0];
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
    }).catch(function (err) {
      console.error('SmoothSend timeline: failed to load data', err);
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
