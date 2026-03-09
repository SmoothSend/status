(function () {
  var OWNER = 'SmoothSend';
  var REPO = 'status';
  var DAYS = 90;
  var DEGRADED_THRESHOLD = 5;   // minutes down → degraded
  var OUTAGE_THRESHOLD = 30;    // minutes down → major outage

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

  function formatDate(dateStr) {
    var d = new Date(dateStr + 'T00:00:00');
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
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
      bar.setAttribute('data-date', formatDate(day));
      bar.setAttribute('data-status', barStatus === 'operational' ? 'Up' : barStatus === 'degraded' ? 'Degraded' : 'Down');
      if (mins > 0) {
        bar.setAttribute('data-down', Math.round(mins) + 'min down');
      }
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
