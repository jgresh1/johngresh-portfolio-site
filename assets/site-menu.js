/* Site menu: a small grey button that sits in a corner of any game page and opens a
   menu pointing back to the home picker (home.html). Self-contained: it injects its own
   styles and markup, and finds home.html relative to this script's own URL, so the same
   tag works from the site root and from games/<name>/.

   <script src="assets/site-menu.js" data-corner="tr" defer></script>
   data-corner: tr | tl | br | bl (default tr)
   data-dock:   optional selector of the game's own HUD row (e.g. "#topright"). While that row
                is showing, the button joins it as its last item, so it wraps with the game's
                icons on small screens; while the row has class "off" it waits in the corner.
*/
(function () {
  var me = document.currentScript;
  var corner = (me && me.getAttribute('data-corner')) || 'tr';
  var dockSel = me && me.getAttribute('data-dock');
  var home = new URL('../home.html', me ? me.src : location.href).href;
  var v = corner.charAt(0) === 'b' ? 'bottom' : 'top';
  var h = corner.charAt(1) === 'l' ? 'left' : 'right';

  var css = [
    '#jg-site{position:fixed;z-index:40;' + v + ':calc(12px + env(safe-area-inset-' + v + ',0px));' + h + ':max(14px,env(safe-area-inset-' + h + ',0px));',
    '  font:600 13px/1.2 "Inter","Segoe UI",system-ui,-apple-system,sans-serif;color:#eceef1;-webkit-tap-highlight-color:transparent}',
    '#jg-site *{box-sizing:border-box}',
    '#jg-site.docked{position:relative;top:auto;right:auto;bottom:auto;left:auto}',
    '#jg-site-btn{display:flex;align-items:center;gap:0;height:40px;min-width:40px;padding:0 11px;border-radius:999px;cursor:pointer;',
    '  color:inherit;font:inherit;border:1px solid rgba(255,255,255,.16);background:rgba(38,40,44,.58);',
    '  -webkit-backdrop-filter:blur(10px) saturate(1.2);backdrop-filter:blur(10px) saturate(1.2);',
    '  box-shadow:0 6px 18px rgba(0,0,0,.28);opacity:.72;transition:opacity .2s,background .2s,gap .2s}',
    '#jg-site-btn:hover,#jg-site-btn:focus-visible,#jg-site.open #jg-site-btn{opacity:1;background:rgba(44,46,51,.86);gap:8px}',
    '#jg-site-btn:focus-visible{outline:2px solid #c9ccd2;outline-offset:2px}',
    '#jg-site-btn svg{width:16px;height:16px;flex:none;display:block}',
    '#jg-site-btn span{max-width:0;overflow:hidden;white-space:nowrap;transition:max-width .25s ease;letter-spacing:.01em}',
    '#jg-site-btn:hover span,#jg-site-btn:focus-visible span,#jg-site.open #jg-site-btn span{max-width:90px}',
    '#jg-site-menu{position:absolute;' + h + ':0;' + (v === 'top' ? 'top' : 'bottom') + ':calc(100% + 8px);width:230px;padding:6px;border-radius:14px;',
    '  background:rgba(34,36,40,.94);border:1px solid rgba(255,255,255,.12);box-shadow:0 18px 44px rgba(0,0,0,.45);',
    '  -webkit-backdrop-filter:blur(14px);backdrop-filter:blur(14px);',
    '  opacity:0;transform:translateY(' + (v === 'top' ? '-6px' : '6px') + ');pointer-events:none;transition:opacity .18s,transform .18s}',
    '#jg-site.open #jg-site-menu{opacity:1;transform:none;pointer-events:auto}',
    '#jg-site-menu .who{padding:9px 10px 8px;border-bottom:1px solid rgba(255,255,255,.08);margin-bottom:4px}',
    '#jg-site-menu .who b{display:block;font-size:14px;font-weight:650;color:#f4f5f7}',
    '#jg-site-menu .who small{display:block;margin-top:2px;font-size:11.5px;font-weight:500;color:#9a9ea6}',
    '#jg-site-menu a{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:10px;border-radius:9px;',
    '  color:#e6e8eb;text-decoration:none;font-weight:550}',
    '#jg-site-menu a:hover,#jg-site-menu a:focus-visible{background:rgba(255,255,255,.08);outline:none}',
    '#jg-site-menu a i{font-style:normal;color:#8d929b;font-size:12px;font-weight:500}',
    '#jg-site-menu a.main{color:#fff}',
    '@media (prefers-reduced-motion:reduce){#jg-site-btn,#jg-site-btn span,#jg-site-menu{transition:none}}'
  ].join('\n');

  function build() {
    if (document.getElementById('jg-site')) return;
    var st = document.createElement('style');
    st.textContent = css;
    document.head.appendChild(st);
    var root = document.createElement('div');
    root.id = 'jg-site';
    root.innerHTML =
      '<button id="jg-site-btn" type="button" aria-haspopup="true" aria-expanded="false" aria-controls="jg-site-menu" title="All projects">' +
        '<svg viewBox="0 0 16 16" aria-hidden="true"><g fill="currentColor"><rect x="1" y="1" width="5.5" height="5.5" rx="1.6"/><rect x="9.5" y="1" width="5.5" height="5.5" rx="1.6"/><rect x="1" y="9.5" width="5.5" height="5.5" rx="1.6"/><rect x="9.5" y="9.5" width="5.5" height="5.5" rx="1.6"/></g></svg>' +
        '<span>Projects</span>' +
      '</button>' +
      '<nav id="jg-site-menu" aria-label="Site">' +
        '<div class="who"><b>John Gresh</b><small>Games, websites and 3D work</small></div>' +
        '<a class="main" href="' + home + '">All projects <i>Home</i></a>' +
        '<a href="' + home + '#games">Games</a>' +
        '<a href="' + home + '#websites">Websites</a>' +
      '</nav>';
    document.body.appendChild(root);
    var btn = root.querySelector('#jg-site-btn');
    function set(open) {
      root.classList.toggle('open', open);
      btn.setAttribute('aria-expanded', open ? 'true' : 'false');
    }
    btn.addEventListener('click', function (e) { e.stopPropagation(); set(!root.classList.contains('open')); });
    // keep game keys (WASD, Space, E) from firing while the menu has focus
    root.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') { set(false); btn.focus(); }
      e.stopPropagation();
    });
    document.addEventListener('pointerdown', function (e) { if (!root.contains(e.target)) set(false); }, true);
    window.addEventListener('blur', function () { set(false); });
    var dock = dockSel && document.querySelector(dockSel);
    if (dock) {
      var place = function () {
        var off = dock.classList.contains('off');
        var target = off ? document.body : dock;
        if (root.parentNode !== target) target.appendChild(root);
        root.classList.toggle('docked', !off);
      };
      new MutationObserver(place).observe(dock, { attributes: true, attributeFilter: ['class'] });
      place();
    }
  }
  if (document.body) build(); else document.addEventListener('DOMContentLoaded', build);
})();
