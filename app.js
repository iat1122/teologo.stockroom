(() => {
  const CURRENCY = 'USD';
  const money = new Intl.NumberFormat(undefined, { style: 'currency', currency: CURRENCY });
  const moneyShort = new Intl.NumberFormat(undefined, {
    style: 'currency', currency: CURRENCY, notation: 'compact', maximumFractionDigits: 1,
  });
  const number = new Intl.NumberFormat();

  const state = {
    search: '',
    category: '',
    sort: 'name',
    order: 'asc',
    items: [],
    editingId: null,
    deleteId: null,
  };

  const $ = (sel) => document.querySelector(sel);
  const el = {
    rows: $('#rows'),
    empty: $('#empty'),
    search: $('#search'),
    categoryFilter: $('#categoryFilter'),
    categoryList: $('#categoryList'),
    categoryBars: $('#categoryBars'),
    restockList: $('#restockList'),
    lowFigure: $('#lowFigure'),
    itemDialog: $('#itemDialog'),
    itemForm: $('#itemForm'),
    dialogTitle: $('#dialogTitle'),
    formError: $('#formError'),
    saveBtn: $('#saveBtn'),
    deleteDialog: $('#deleteDialog'),
    deleteText: $('#deleteText'),
    toast: $('#toast'),
  };


  const escapeHtml = (s) =>
    String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  async function api(url, options = {}) {
    const res = await fetch(url, { headers: { 'Content-Type': 'application/json' }, ...options });
    if (res.status === 204) return null;
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const err = new Error(data.error || 'Request failed.');
      err.details = data.details || {};
      throw err;
    }
    return data;
  }

  let toastTimer;
  function toast(message, isError = false) {
    el.toast.textContent = message;
    el.toast.classList.toggle('error', isError);
    el.toast.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { el.toast.hidden = true; }, 3200);
  }

  function debounce(fn, ms) {
    let t;
    return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
  }


  async function loadItems() {
    const params = new URLSearchParams({
      search: state.search,
      category: state.category,
      sort: state.sort,
      order: state.order,
    });
    state.items = await api(`/api/items?${params}`);
    renderTable();
  }

  async function loadStats() {
    const { totals, byCategory, restock } = await api('/api/stats');

    $('#statItems').textContent = number.format(totals.items);
    $('#statUnits').textContent = number.format(totals.units);
    $('#statValue').textContent = moneyShort.format(totals.value);
    $('#statValue').title = money.format(totals.value);
    $('#statLow').textContent = number.format(totals.low);
    el.lowFigure.classList.toggle('has-alert', totals.low > 0);

    renderCategories(byCategory);
    renderRestock(restock);
    renderCategoryOptions(byCategory);
  }

  const refresh = () => Promise.all([loadItems(), loadStats()]);

  function stockState(item) {
    if (item.quantity === 0) return 'out';
    if (item.quantity <= item.reorder_level) return 'low';
    return 'ok';
  }

  function renderTable() {
    document.querySelectorAll('.sort').forEach((btn) => {
      const active = btn.dataset.sort === state.sort;
      btn.dataset.dir = active ? state.order : '';
      if (active) btn.setAttribute('aria-sort', state.order === 'asc' ? 'ascending' : 'descending');
      else btn.removeAttribute('aria-sort');
    });

    if (!state.items.length) {
      el.rows.innerHTML = '';
      el.empty.hidden = false;
      el.empty.textContent = state.search || state.category
        ? 'No items match your search. Clear the filters to see everything.'
        : 'Your inventory is empty. Select "Add item" to create the first one.';
      return;
    }
    el.empty.hidden = true;

    el.rows.innerHTML = state.items.map((item) => {
      const s = stockState(item);

      const scale = Math.max(item.reorder_level * 3, item.quantity, 1);
      const fill = Math.min((item.quantity / scale) * 100, 100);
      const tick = (item.reorder_level / scale) * 100;
      const note = s === 'out' ? 'Out of stock' : s === 'low' ? 'Low, reorder at ' + item.reorder_level : 'Reorder at ' + item.reorder_level;

      return `
        <tr data-id="${item.id}">
          <td>
            <div class="item-name">${escapeHtml(item.name)}</div>
            <div class="item-sku">${escapeHtml(item.sku)}</div>
          </td>
          <td>${escapeHtml(item.category)}</td>
          <td class="num">${money.format(item.price)}</td>
          <td class="stock-col">
            <div class="stock">
              <div class="stock-text">
                <span class="stock-qty">${number.format(item.quantity)}</span>
                <span class="stock-note ${s === 'ok' ? '' : s}">${note}</span>
              </div>
              <div class="meter ${s}" role="img" aria-label="${item.quantity} in stock, reorder level ${item.reorder_level}">
                <div class="meter-fill" style="width:${fill}%"></div>
                <div class="meter-tick" style="left:calc(${tick}% - 1px)"></div>
              </div>
            </div>
          </td>
          <td class="actions">
            <button class="link-btn" data-action="edit" type="button" aria-label="Edit ${escapeHtml(item.name)}">Edit</button>
            <button class="link-btn danger" data-action="delete" type="button" aria-label="Delete ${escapeHtml(item.name)}">Delete</button>
          </td>
        </tr>`;
    }).join('');
  }

  function renderCategories(list) {
    if (!list.length) {
      el.categoryBars.innerHTML = '<p class="side-empty">Add items to see how stock value splits by category.</p>';
      return;
    }
    const max = Math.max(...list.map((c) => c.value), 1);
    el.categoryBars.innerHTML = list.map((c) => `
      <div>
        <div class="bar-top">
          <span>${escapeHtml(c.category)}</span>
          <span>${money.format(c.value)}</span>
        </div>
        <div class="bar-track"><div class="bar-fill" style="width:${(c.value / max) * 100}%"></div></div>
      </div>`).join('');
  }

  function renderRestock(list) {
    if (!list.length) {
      el.restockList.innerHTML = '<li class="side-empty">Everything is above its reorder level.</li>';
      return;
    }
    el.restockList.innerHTML = list.map((i) => `
      <li>
        <button type="button" data-edit-id="${i.id}">
          <span>
            <span class="r-name">${escapeHtml(i.name)}</span>
            <span class="r-sub">${escapeHtml(i.sku)}, reorder at ${i.reorder_level}</span>
          </span>
          <span class="pill ${i.quantity === 0 ? 'out' : ''}">${i.quantity === 0 ? 'Out' : i.quantity + ' left'}</span>
        </button>
      </li>`).join('');
  }

  function renderCategoryOptions(list) {
    const names = list.map((c) => c.category).sort((a, b) => a.localeCompare(b));
    const current = state.category;
    el.categoryFilter.innerHTML =
      '<option value="">All categories</option>' +
      names.map((n) => `<option value="${escapeHtml(n)}">${escapeHtml(n)}</option>`).join('');

      if (current && !names.includes(current)) {
      state.category = '';
      loadItems();
    }
    el.categoryFilter.value = state.category;
    el.categoryList.innerHTML = names.map((n) => `<option value="${escapeHtml(n)}"></option>`).join('');
  }


  function clearErrors() {
    el.formError.hidden = true;
    el.itemForm.querySelectorAll('.field-error').forEach((p) => { p.textContent = ''; });
    el.itemForm.querySelectorAll('input').forEach((i) => i.removeAttribute('aria-invalid'));
  }

  function showErrors(details, message) {
    const keys = Object.keys(details || {});
    keys.forEach((key) => {
      const p = el.itemForm.querySelector(`.field-error[data-for="${key}"]`);
      const input = el.itemForm.elements[key];
      if (p) p.textContent = details[key];
      if (input) input.setAttribute('aria-invalid', 'true');
    });
    if (!keys.length) {
      el.formError.textContent = message;
      el.formError.hidden = false;
    } else {
      const first = el.itemForm.elements[keys[0]];
      if (first) first.focus();
    }
  }

  function openForm(item) {
    clearErrors();
    el.itemForm.reset();
    state.editingId = item ? item.id : null;
    el.dialogTitle.textContent = item ? 'Edit item' : 'Add item';
    el.saveBtn.textContent = item ? 'Save changes' : 'Save item';
    if (item) {
      const f = el.itemForm.elements;
      f.name.value = item.name;
      f.sku.value = item.sku;
      f.category.value = item.category;
      f.quantity.value = item.quantity;
      f.reorder_level.value = item.reorder_level;
      f.price.value = item.price;
    }
    el.itemDialog.showModal();
    el.itemForm.elements.name.focus();
  }

  el.itemForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    clearErrors();
    const f = el.itemForm.elements;
    const payload = {
      name: f.name.value,
      sku: f.sku.value,
      category: f.category.value,
      quantity: f.quantity.value,
      reorder_level: f.reorder_level.value,
      price: f.price.value,
    };

    el.saveBtn.disabled = true;
    try {
      if (state.editingId) {
        await api(`/api/items/${state.editingId}`, { method: 'PUT', body: JSON.stringify(payload) });
        toast('Changes saved.');
      } else {
        await api('/api/items', { method: 'POST', body: JSON.stringify(payload) });
        toast('Item added.');
      }
      el.itemDialog.close();
      await refresh();
    } catch (err) {
      showErrors(err.details, err.message);
    } finally {
      el.saveBtn.disabled = false;
    }
  });

  $('#addBtn').addEventListener('click', () => openForm(null));
  $('#cancelBtn').addEventListener('click', () => el.itemDialog.close());


  el.deleteDialog.addEventListener('close', async () => {
    if (el.deleteDialog.returnValue !== 'confirm' || !state.deleteId) return;
    try {
      await api(`/api/items/${state.deleteId}`, { method: 'DELETE' });
      toast('Item deleted.');
      await refresh();
    } catch (err) {
      toast(err.message, true);
    } finally {
      state.deleteId = null;
      el.deleteDialog.returnValue = '';
    }
  });


  el.rows.addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-action]');
    if (!btn) return;
    const id = Number(btn.closest('tr').dataset.id);
    const item = state.items.find((i) => i.id === id);
    if (!item) return;

    if (btn.dataset.action === 'edit') {
      openForm(item);
    } else {
      state.deleteId = id;
      el.deleteText.textContent = `${item.name} (${item.sku}) will be removed from your inventory. You can't undo this.`;
      el.deleteDialog.showModal();
    }
  });

  el.restockList.addEventListener('click', async (e) => {
    const btn = e.target.closest('button[data-edit-id]');
    if (!btn) return;
    try {
      openForm(await api(`/api/items/${btn.dataset.editId}`));
    } catch (err) {
      toast(err.message, true);
    }
  });

  document.querySelector('thead').addEventListener('click', (e) => {
    const btn = e.target.closest('.sort');
    if (!btn) return;
    const column = btn.dataset.sort;
    if (state.sort === column) state.order = state.order === 'asc' ? 'desc' : 'asc';
    else { state.sort = column; state.order = 'asc'; }
    loadItems().catch((err) => toast(err.message, true));
  });

  el.search.addEventListener('input', debounce(() => {
    state.search = el.search.value.trim();
    loadItems().catch((err) => toast(err.message, true));
  }, 200));

  el.categoryFilter.addEventListener('change', () => {
    state.category = el.categoryFilter.value;
    loadItems().catch((err) => toast(err.message, true));
  });

  [el.itemDialog, el.deleteDialog].forEach((dlg) => {
    dlg.addEventListener('click', (e) => {
      if (e.target === dlg) dlg.close();
    });
  });


  refresh().catch((err) => toast(err.message, true));
})();
