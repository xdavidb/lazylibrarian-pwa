
(function(){
  // ---- SELF-UPDATE: ensure the newest SW (sw-v5.js) is registered ----
  // The old SW injects this script on every page; registering the versioned
  // filename forces a fresh install even when the browser holds the old SW.
  (function ensureNewSW() {
    if (!('serviceWorker' in navigator)) return;
    if (window.__llSWChecked) return;
    window.__llSWChecked = true;
    try {
      navigator.serviceWorker.getRegistrations().then(function(regs) {
        var isNew = regs.some(function(r) {
          return r.active && r.active.scriptURL.indexOf('sw-v5.js') !== -1;
        });
        if (!isNew) {
          navigator.serviceWorker.register('/sw-v5.js', { scope: '/' }).then(function() {
            // new SW installed (skipWaiting in its install handler takes over)
          });
        }
      });
    } catch (e) {}
  })();
  // default rows-per-page 20
  if (window.$ && $.fn.dataTable) {
    $.extend(true, $.fn.dataTable.defaults, { "pageLength": 20 });
  }
  // move length selector to bottom (rewrite dom strings in inline scripts already done server-side by SW; here as fallback)
  if (window.$) {
    $(document).ready(function(){
      var $table = $('#book_table');
      // only touch the layout AFTER DataTables has initialized it (avoid duplicate-init warning)
      var wrapper = $table.closest('.dataTables_wrapper');
      var len = wrapper.find('.dataTables_length');
      var info = wrapper.find('.dataTables_info');
      var pag = wrapper.find('.dataTables_paginate');
      var filter = wrapper.find('.dataTables_filter');
      // skip if not a DataTables-enhanced table yet
      if (!len.length && !pag.length) return;
      // ensure order: filter top, then bottom group (length + info + pagination)
      filter.css('text-align','center').css('padding','4px 0');
      var bottom = wrapper.find('.ll-bottom-row');
      if (!bottom.length) {
        bottom = $('<div class="ll-bottom-row" style="text-align:center;padding:6px 0;"></div>');
        wrapper.append(bottom);
      }
      bottom.append(len).append(info).append(pag);
    });
  }
  // tap status badge -> quick menu
  if (window.$) {
    $(document).on('click', '#book_table tbody tr td a.btn', function(e) {
      var href = $(this).attr('href');
      if (href && href.length > 0 && href !== '#') return; // real link
      e.preventDefault(); e.stopPropagation();
      var tr = $(this).closest('tr');
      var cb = tr.find('input[type=checkbox]').first();
      var bookid = '';
      if (cb.length) { bookid = cb.attr('name') || (cb.attr('id')||'').replace(/^[NE]/,''); }
      if (!bookid) return;
      var isAudio = $(this).find('.fa-headphones').length > 0;
      var library = isAudio ? 'AudioBook' : 'eBook';
      var badge = this;
      if ($('#llQuickStatus').length) $('#llQuickStatus').remove();
      var menu = $('<div id="llQuickStatus" style="position:fixed;z-index:99999;background:#0d2b3d;border:1px solid #265c74;border-radius:10px;padding:8px;box-shadow:0 4px 16px rgba(0,0,0,.5);min-width:180px;">' +
        '<div style="padding:4px 10px;color:#8dcfc9;font-size:13px;font-weight:600;">' + (isAudio ? 'AudioBook status' : 'eBook status') + '</div>' +
        '<a href="#" data-s="Wanted" style="display:block;padding:8px 10px;color:#eee;text-decoration:none;border-radius:6px;">Wanted</a>' +
        '<a href="#" data-s="Open" style="display:block;padding:8px 10px;color:#eee;text-decoration:none;border-radius:6px;">Open (have it)</a>' +
        '<a href="#" data-s="Ignored" style="display:block;padding:8px 10px;color:#eee;text-decoration:none;border-radius:6px;">Ignored</a>' +
        '<a href="#" data-s="Skipped" style="display:block;padding:8px 10px;color:#eee;text-decoration:none;border-radius:6px;">Skipped</a></div>').appendTo('body');
      var x = e.pageX, y = e.pageY;
      if (x + 180 > window.innerWidth) x = window.innerWidth - 188;
      if (y + 180 > window.innerHeight) y = window.innerHeight - 188;
      menu.css({left: x + 'px', top: y + 'px'});
      menu.on('click', 'a', function(ev) {
        ev.preventDefault();
        var status = $(this).data('s');
        $('#llQuickStatus').remove();
        var action = status;
        if (status === 'Wanted') action = isAudio ? 'WantAudio' : 'WantEbook';
        if (status === 'Open') action = 'Have';
        var params = { action: action, library: library };
        params[bookid] = '';
        $.get('mark_books_ajax', params, function() {
          var label = status === 'Open' ? 'Have' : status;
          $(badge).html($(badge).find('i').prop('outerHTML') + ' ' + label);
          if (status === 'Wanted') $(badge).removeClass('btn-default grey').addClass('btn-danger');
          setTimeout(function(){ location.reload(); }, 800);
        });
      });
      setTimeout(function(){ $(document).one('click', function(){ $('#llQuickStatus').remove(); }); }, 10);
    });
  }
  // auto-login: fill stored credentials + save on successful login
  (function authFlow(){
    var u = document.getElementById('current_username');
    var p = document.getElementById('current_password');

    function requestCreds() {
      if (navigator.serviceWorker && navigator.serviceWorker.controller) {
        return new Promise(function(resolve){
          var ch = new MessageChannel();
          navigator.serviceWorker.controller.postMessage({type:'GET_AUTH'}, [ch.port2]);
          ch.port1.onmessage = function(ev){ resolve(ev.data || {}); };
          setTimeout(function(){ resolve({}); }, 1500);
        });
      }
      return Promise.resolve({});
    }
    function saveCreds(user, pass) {
      if (navigator.serviceWorker && navigator.serviceWorker.controller) {
        var ch = new MessageChannel();
        navigator.serviceWorker.controller.postMessage(
          {type:'SAVE_AUTH', username: user, password: pass}, [ch.port2]);
      }
    }

    if (u && p) {
      // login page shown: try stored creds, and capture creds on manual submit
      var form = u.closest('form');
      if (form) {
        form.addEventListener('submit', function(){
          saveCreds(u.value, p.value);
        });
      }
      requestCreds().then(function(d){
        if (d.username && d.password) {
          u.value = d.username;
          p.value = d.password;
          var btn = document.querySelector('button[name=login], button#login, input[type=submit]');
          if (btn) setTimeout(function(){ btn.click(); }, 400);
        }
      });
    } else {
      // already logged in: capture creds for next time (only if we have a session cookie)
      requestCreds().then(function(d){
        if (!d.username) {
          // We can't read the password back from the server. Fallback: prompt-free
          // capture happens on the login page itself (above). Nothing to do here.
        }
      });
    }
  })();
})();
