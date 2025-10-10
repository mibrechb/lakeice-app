export function setupRouter() {
  function switchTab(tabName) {
    document.querySelectorAll('.tab').forEach(tab => {
      tab.classList.toggle('active', tab.dataset.tab === tabName);
    });
    document.querySelectorAll('.static-page, #map').forEach(page => {
      page.style.display = 'none';
    });
    // Hide map-container and panel for static pages
    if (tabName === 'map') {
      document.getElementById('map-container').style.display = '';
      document.getElementById('panel').style.display = '';
      document.getElementById('map').style.display = 'block';
    } else {
      document.getElementById('map-container').style.display = 'none';
      document.getElementById('panel').style.display = 'none';
      const pageSection = document.getElementById(tabName);
      pageSection.style.display = 'block';
      fetch(`./pages/${tabName}.html`)
        .then(r => r.text())
        .then(html => { pageSection.innerHTML = html; });
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
          window.router?.switchTab(item.dataset.tab);
          mobileDropdown.style.display = 'none';
        });
      });
    }
  });

  return window.router;
}
