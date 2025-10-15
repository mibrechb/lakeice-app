export function setupRouter() {
  function switchTab(tabName, updateHash = true) {
    document.querySelectorAll('.tab').forEach(tab => {
      tab.classList.toggle('active', tab.dataset.tab === tabName);
    });
    document.querySelectorAll('.static-page, #map').forEach(page => {
      page.style.display = 'none';
    });
    if (tabName === 'map') {
      document.getElementById('map-container').style.display = '';
      document.getElementById('panel').style.display = '';
      document.getElementById('map').style.display = 'block';
      if (updateHash) {
        // Remove hash entirely (avoid leaving a trailing '#')
        history.replaceState(null, '', window.location.pathname + window.location.search);
      }
    } else {
      document.getElementById('map-container').style.display = 'none';
      document.getElementById('panel').style.display = 'none';
      const pageSection = document.getElementById(tabName);
      pageSection.style.display = 'block';
      fetch(`./pages/${tabName}.html`)
        .then(r => r.text())
        .then(html => { pageSection.innerHTML = html; });
      if (updateHash) {
        window.location.hash = '#' + tabName;
      }
    }
    document.dispatchEvent(new CustomEvent('tabchange', { detail: { name: tabName } }));
  }
  window.router = { switchTab };

  // Setup mobile tab event listeners after DOM is ready
  document.addEventListener('DOMContentLoaded', () => {
    const hamburger = document.querySelector('.hamburger');
    const mobileDropdown = document.querySelector('.mobile-tabs-dropdown');
    if (hamburger && mobileDropdown) {
      hamburger.addEventListener('click', () => {
        mobileDropdown.style.display = 'block';
      });
      document.body.addEventListener('click', (e) => {
        if (!e.target.closest('.hamburger') && !e.target.closest('.mobile-tabs-dropdown')) {
          mobileDropdown.style.display = 'none';
        }
      });
      mobileDropdown.querySelectorAll('.dropdown-item').forEach(item => {
        item.addEventListener('click', () => {
          window.router?.switchTab(item.dataset.tab, true);
          mobileDropdown.style.display = 'none';
        });
      });
      // Desktop tabs: delegate click handling here so router is the single source of truth
      document.querySelectorAll('.tab').forEach(tab => {
        tab.addEventListener('click', () => {
          window.router?.switchTab(tab.dataset.tab, true);
        });
      });
    }
  });

  // Helper to get tab name from hash
  function getTabFromHash() {
    const hash = window.location.hash.replace(/^#/, '');
    // Default to 'map' if no hash or unknown tab
    const validTabs = ['map', 'about', 'funding', 'methods'];
    return validTabs.includes(hash) ? hash : 'map';
  }

  // Listen for hash changes and load the correct tab
  window.addEventListener('hashchange', () => {
    window.router.switchTab(getTabFromHash(), false);
  });

  // On initial load, switch to the tab in the hash
  document.addEventListener('DOMContentLoaded', () => {
    window.router.switchTab(getTabFromHash(), false);
  });

  return window.router;
}
