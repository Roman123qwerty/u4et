// --- Защита от белого экрана (перехват ошибок) ---
window.addEventListener('unhandledrejection', function(event) {
  alert('Ошибка базы данных: ' + event.reason);
});
window.addEventListener('error', function(event) {
  console.error('Ошибка скрипта:', event.message);
});
// ------------------------------------------------

// ---- Тема ----
function applyTheme() {
  const pref = localStorage.getItem('theme') || 'auto';
  let theme = pref === 'auto' ? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light') : pref;
  document.documentElement.dataset.theme = theme;
}
applyTheme();
window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
  if ((localStorage.getItem('theme') || 'auto') === 'auto') applyTheme();
});

// ---- Состояние ----
const state = { 
  machines: [], currentMachineTasks: [], allTasks: [],
  historyStartDate: '', historyEndDate: '', searchOrder: ''
};

// ---- Утилиты ----
function formatDate(d) {
  const pad = (n) => n.toString().padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
}

function normalizeOrderNo(input) {
  let str = input.trim().replace(',', '.');
  let parts = str.split('.');
  if (parts.length > 0) parts[0] = parts[0].replace(/^0+(?=\d)/, '');
  let warning = (parts.length !== 2 || parts[1].length !== 2) ? 'Год должен быть 2-значным' : null;
  return { value: parts.join('.'), warning };
}

// ---- UI Компоненты ----
function showToast(msg, actionText = null, actionCallback = null) {
  const existing = document.querySelector('.toast-container');
  if (existing) existing.remove();

  const toast = document.createElement('div');
  toast.className = 'toast-container';
  toast.innerHTML = `<span>${msg}</span>`;
  
  if (actionText && actionCallback) {
    const btn = document.createElement('button');
    btn.className = 'toast-action';
    btn.textContent = actionText;
    btn.onclick = () => { actionCallback(); toast.remove(); };
    toast.appendChild(btn);
  }
  document.body.appendChild(toast);
  setTimeout(() => { if (toast.parentNode) toast.remove(); }, 10000);
}

function openModal(title, contentHTML, confirmText, onSubmit) {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal">
      <h3>${title}</h3>
      <form id="modal-form">
        ${contentHTML}
        <div class="modal-actions">
          <button type="button" class="btn btn-secondary" id="btn-cancel">Отмена</button>
          <button type="submit" class="btn btn-primary" id="btn-submit">${confirmText}</button>
        </div>
      </form>
    </div>
  `;
  document.body.appendChild(overlay);
  setTimeout(() => overlay.classList.add('show'), 10);

  const close = () => { overlay.classList.remove('show'); setTimeout(() => overlay.remove(), 200); };
  overlay.querySelector('#btn-cancel').onclick = close;
  overlay.querySelector('#modal-form').onsubmit = async (e) => {
    e.preventDefault();
    const success = await onSubmit(overlay);
    if (success) close();
  };
  setTimeout(() => overlay.querySelector('input[type="text"]')?.focus(), 100);
}

// ---- Экраны ----
const screens = {
  overview: {
    title: 'Обзор',
    render: () => {
      const sorted = [...state.machines].sort((a, b) => a.order - b.order);
      let html = '<div class="overview-container">';
      
      sorted.forEach(m => {
        const mTasks = state.allTasks.filter(t => t.machineId === m.id).sort((a,b) => a.pos - b.pos);
        
        html += `
          <div class="overview-col">
            <div class="overview-col-header" onclick="location.hash='#/machine/${m.id}'">
              <span>${m.number}. ${m.model}</span>
              <span class="badge ${mTasks.length ? '' : 'empty'}">${mTasks.length}</span>
            </div>
            <div class="overview-col-body">
              ${mTasks.length === 0 ? '<div style="text-align:center;color:var(--text-muted);font-size:13px;margin-top:20px;">Пусто</div>' : ''}
              ${mTasks.map(t => `
                <div class="overview-task ${t.isUrgent ? 'urgent' : ''}">
                  <div class="ot-title">Заказ ${t.orderNo} ${t.isUrgent ? '🚨' : ''}</div>
                  <div>${t.partName}</div>
                  <div class="ot-qty">⏳ ${t.total - t.done}(${t.total})</div>
                  ${t.note ? `<div class="ot-note">📝 ${t.note}</div>` : ''}
                </div>
              `).join('')}
            </div>
          </div>
        `;
      });
      return html + '</div>';
    }
  },
  machines: {
    title: 'Станки',
    render: () => {
      const sorted = [...state.machines].sort((a, b) => a.order - b.order);
      let html = '<div class="machine-list">';
      sorted.forEach(m => {
        const mTasks = state.allTasks.filter(t => t.machineId === m.id).sort((a,b) => a.pos - b.pos);
        const hasTasks = mTasks.length > 0;
        const firstTask = hasTasks ? mTasks[0] : null;
        
        html += `
          <div class="machine-row" data-id="${m.id}">
            <div class="machine-title">
              <strong>${m.number}. ${m.model}</strong>
              <span class="badge ${hasTasks ? '' : 'empty'}">${mTasks.length}</span>
            </div>
            ${hasTasks ? `
              <div class="machine-first-task">
                №${firstTask.pos} ⏳ ${firstTask.total - firstTask.done}(${firstTask.total}) 
                <span style="color:var(--accent); font-weight:600">Заказ ${firstTask.orderNo}</span> · ${firstTask.partName} ${firstTask.isUrgent ? '🚨' : ''}
              </div>
            ` : `<div class="machine-queue-empty">очередь пуста</div>`}
          </div>
        `;
      });
      return html + '</div>';
    },
    afterRender: () => {
      document.querySelectorAll('.machine-row').forEach(el => {
        el.addEventListener('click', () => location.hash = `#/machine/${el.dataset.id}`);
      });
    }
  },
  machine: {
    title: 'Станок',
    render: (id) => {
      const m = state.machines.find(x => x.id === id);
      if (!m) return '<div class="placeholder">Станок не найден</div>';
      
      let html = `<div class="placeholder" style="text-align:left; padding:0 0 10px 0; font-size:18px; color:var(--text)">
        <strong>${m.number}. ${m.model}</strong>
      </div>`;
      
      if (state.currentMachineTasks.length === 0) {
        html += '<div class="placeholder">Очередь пуста. Нажмите «+», чтобы добавить.</div>';
      } else {
        state.currentMachineTasks.forEach((t, index) => {
          const remaining = t.total - t.done;
          html += `
            <div class="task-card ${t.isUrgent ? 'urgent' : ''}">
              <div class="task-content">
                <div class="task-header">
                  <span>№${index + 1}</span>
                  <span class="task-order">Заказ ${t.orderNo}</span>
                  ${t.isUrgent ? '<span class="urgent-badge">СРОЧНО</span>' : ''}
                </div>
                <div class="task-part">${t.partName}</div>
                <div class="task-qty">⏳ ${remaining}(${t.total})</div>
                ${t.note ? `<div class="task-note">📝 ${t.note}</div>` : ''}
              </div>
              <div style="display:flex; align-items:center;">
                <button class="btn-check" data-id="${t.id}">✓</button>
                <button class="btn-menu" data-id="${t.id}" style="background:none; border:none; color:var(--text-muted); font-size:24px; padding:0 0 0 10px; cursor:pointer;">⋯</button>
              </div>
            </div>
          `;
        });
      }
      html += `<button class="fab" id="btn-add-task">+</button>`;
      return html;
    },
    afterRender: (id) => {
      // ДОБАВЛЕНИЕ
      document.getElementById('btn-add-task').onclick = () => {
        openModal('Новая задача', `
          <div class="form-group">
            <label>Номер заказа (NN.NN)</label>
            <input type="text" name="orderNo" placeholder="69.27" required>
            <div class="hint" id="order-hint"></div>
          </div>
          <div class="form-group">
            <label>Название детали</label>
            <input type="text" name="partName" placeholder="Вал 20х100" required>
          </div>
          <div class="form-group">
            <label>Количество</label>
            <input type="number" name="total" min="1" value="1" required>
          </div>
          <div class="form-group">
            <label class="checkbox-label">
              <input type="checkbox" name="isUrgent"> 🚨 Срочная задача
            </label>
          </div>
          <div class="form-group">
            <label>Заметка (необязательно)</label>
            <textarea name="note" placeholder="Например: требует проверки ОТК"></textarea>
          </div>
        `, 'Добавить', async (overlay) => {
          const form = overlay.querySelector('form');
          const { value: orderNo, warning } = normalizeOrderNo(form.orderNo.value);
          if (warning) showToast(`Внимание: ${warning}`);
          const partName = form.partName.value.trim();
          const total = parseInt(form.total.value, 10);
          const isUrgent = form.isUrgent.checked;
          const note = form.note.value.trim();
          
          if (state.currentMachineTasks.some(t => t.orderNo === orderNo && t.partName.toLowerCase() === partName.toLowerCase())) {
            if (!confirm(`Задача "${partName}" по заказу ${orderNo} уже есть в очереди. Всё равно добавить?`)) return false;
          }

          const newTask = { 
            id: 'task_' + Date.now(), machineId: id, pos: state.currentMachineTasks.length + 1, 
            orderNo, partName, total, done: 0, isUrgent, note,
            createdAt: new Date().toISOString() 
          };
          await put('tasks', newTask);
          render();
          return true;
        });
        const orderInput = document.querySelector('input[name="orderNo"]');
        const hint = document.getElementById('order-hint');
        orderInput.addEventListener('input', () => {
          const { warning } = normalizeOrderNo(orderInput.value);
          hint.textContent = warning || ''; hint.style.display = warning ? 'block' : 'none';
        });
      };

      // ВЫПОЛНЕНИЕ
      document.querySelectorAll('.btn-check').forEach(btn => {
        btn.onclick = () => {
          const task = state.currentMachineTasks.find(t => t.id === btn.dataset.id);
          const remaining = task.total - task.done;
          const today = formatDate(new Date());

          openModal('Выполнено?', `
            <div style="margin-bottom:12px; font-size:15px; color:var(--text-muted)">
              Заказ ${task.orderNo} · ${task.partName}<br>Осталось сделать: <strong style="color:var(--warn)">${remaining}</strong> (всего ${task.total})
            </div>
            <div class="form-group"><label>Сколько сделано</label><input type="number" name="qty" min="1" max="${remaining}" value="${remaining}" required></div>
            <div class="form-group"><label>Дата выполнения</label><input type="date" name="eventDate" value="${today}" required></div>
          `, 'Подтвердить', async (overlay) => {
            const form = overlay.querySelector('form');
            const qty = parseInt(form.qty.value, 10);
            const eventDate = form.eventDate.value;
            if (qty <= 0 || qty > remaining) { showToast(`Введите число от 1 до ${remaining}`); return false; }

            const historyRecord = {
              id: 'hist_' + Date.now(), type: 'done', machineId: id,
              machineSnapshot: `${state.machines.find(x => x.id === id).number}. ${state.machines.find(x => x.id === id).model}`,
              orderNo: task.orderNo, partName: task.partName, total: task.total, qty: qty, eventDate, 
              isUrgent: task.isUrgent, note: task.note,
              linkedTaskId: task.id, status: 'active'
            };
            await put('history', historyRecord);

            const originalTask = { ...task }; 
            task.done += qty;
            if (task.done >= task.total) { await deleteItem('tasks', task.id); } 
            else { await put('tasks', task); }

            render();
            showToast(`✓ Сделано ${qty}`, 'Отменить', async () => {
              await deleteItem('history', historyRecord.id);
              await put('tasks', originalTask);
              render();
              showToast('Действие отменено');
            });
            return true;
          });
        };
      });

      // МЕНЮ (⋯)
      document.querySelectorAll('.btn-menu').forEach(btn => {
        btn.onclick = () => {
          const task = state.currentMachineTasks.find(t => t.id === btn.dataset.id);
          const remaining = task.total - task.done;
          
          const isFirst = state.currentMachineTasks[0].id === task.id;
          const isLast = state.currentMachineTasks[state.currentMachineTasks.length - 1].id === task.id;

          let moveHtml = '';
          if (!isFirst) moveHtml += `<button type="button" class="btn btn-secondary" id="act-up" style="width:100%; text-align:left; padding:15px; margin-bottom:10px;">⬆️ Поднять в очереди</button>`;
          if (!isLast) moveHtml += `<button type="button" class="btn btn-secondary" id="act-down" style="width:100%; text-align:left; padding:15px; margin-bottom:10px;">⬇️ Опустить в очереди</button>`;

          // Кнопки быстрого доступа к срочности и заметке
          const urgentBtnText = task.isUrgent ? '❌ Убрать срочность' : '🚨 Сделать срочной';
          const noteBtnText = task.note ? '📝 Изменить заметку' : '📝 Добавить заметку';

          openModal('Действия с задачей', `
            <div style="margin-bottom:20px; font-size:15px;">
              <strong>${task.partName}</strong><br>
              <span style="color:var(--text-muted)">Заказ ${task.orderNo} · Осталось: ${remaining} из ${task.total}</span>
            </div>
            <div style="display:flex; flex-direction:column;">
              ${moveHtml}
              <button type="button" class="btn btn-secondary" id="act-urgent" style="width:100%; text-align:left; padding:15px; margin-bottom:10px;">${urgentBtnText}</button>
              <button type="button" class="btn btn-secondary" id="act-note" style="width:100%; text-align:left; padding:15px; margin-bottom:10px;">${noteBtnText}</button>
              <button type="button" class="btn btn-secondary" id="act-edit" style="width:100%; text-align:left; padding:15px; margin-bottom:10px;">✏️ Редактировать</button>
              <button type="button" class="btn btn-secondary" id="act-move" style="width:100%; text-align:left; padding:15px; margin-bottom:10px;">➡️ Переместить на другой станок</button>
              <button type="button" class="btn btn-danger" id="act-cancel" style="width:100%; text-align:left; padding:15px; background:var(--danger); color:#fff;">🗑️ Отменить задачу</button>
            </div>
          `, 'Закрыть', () => true);
          
          setTimeout(() => {
            const overlay = document.querySelector('.modal-overlay');
            
            // БЫСТРАЯ СРОЧНОСТЬ
            overlay.querySelector('#act-urgent').onclick = async () => {
              task.isUrgent = !task.isUrgent;
              await put('tasks', task);
              overlay.remove();
              render();
              showToast(task.isUrgent ? '🚨 Задача срочная' : 'Срочность снята');
            };

            // БЫСТРАЯ ЗАМЕТКА
            overlay.querySelector('#act-note').onclick = () => {
              overlay.remove();
              openModal('Заметка к задаче', `
                <div class="form-group">
                  <label>Текст заметки (оставьте пустым, чтобы удалить)</label>
                  <textarea name="note" rows="3">${task.note || ''}</textarea>
                </div>
              `, 'Сохранить', async (ov) => {
                const f = ov.querySelector('form');
                task.note = f.note.value.trim();
                await put('tasks', task);
                render();
                return true;
              });
            };

            const btnUp = overlay.querySelector('#act-up');
            if (btnUp) {
              btnUp.onclick = async () => {
                const idx = state.currentMachineTasks.findIndex(t => t.id === task.id);
                const prevTask = state.currentMachineTasks[idx - 1];
                const temp = task.pos;
                task.pos = prevTask.pos;
                prevTask.pos = temp;
                await put('tasks', task);
                await put('tasks', prevTask);
                overlay.remove();
                render();
              };
            }

            const btnDown = overlay.querySelector('#act-down');
            if (btnDown) {
              btnDown.onclick = async () => {
                const idx = state.currentMachineTasks.findIndex(t => t.id === task.id);
                const nextTask = state.currentMachineTasks[idx + 1];
                const temp = task.pos;
                task.pos = nextTask.pos;
                nextTask.pos = temp;
                await put('tasks', task);
                await put('tasks', nextTask);
                overlay.remove();
                render();
              };
            }

            overlay.querySelector('#act-edit').onclick = () => {
              overlay.remove();
              openModal('Редактировать задачу', `
                <div class="form-group"><label>Номер заказа</label><input type="text" name="orderNo" value="${task.orderNo}" required></div>
                <div class="form-group"><label>Название детали</label><input type="text" name="partName" value="${task.partName}" required></div>
                <div class="form-group"><label>Всего нужно (сделано ${task.done})</label><input type="number" name="total" min="${Math.max(1, task.done)}" value="${task.total}" required></div>
                <div class="form-group">
                  <label class="checkbox-label">
                    <input type="checkbox" name="isUrgent" ${task.isUrgent ? 'checked' : ''}> 🚨 Срочная задача
                  </label>
                </div>
                <div class="form-group">
                  <label>Заметка</label>
                  <textarea name="note">${task.note || ''}</textarea>
                </div>
              `, 'Сохранить', async (ov) => {
                const f = ov.querySelector('form');
                const { value: orderNo } = normalizeOrderNo(f.orderNo.value);
                task.orderNo = orderNo;
                task.partName = f.partName.value.trim();
                task.total = parseInt(f.total.value, 10);
                task.isUrgent = f.isUrgent.checked;
                task.note = f.note.value.trim();
                await put('tasks', task);
                render(); return true;
              });
            };

            overlay.querySelector('#act-move').onclick = () => {
              overlay.remove();
              const otherMachines = state.machines.filter(m => m.id !== id).sort((a,b) => a.order - b.order);
              const options = otherMachines.map(m => `<option value="${m.id}">${m.number}. ${m.model}</option>`).join('');
              
              openModal('Переместить задачу', `
                <div style="margin-bottom:15px; font-size:15px; color:var(--text-muted)">Задача: ${task.partName} (осталось ${remaining})</div>
                <div class="form-group"><label>Выберите станок</label><select name="targetMachine" style="width:100%; padding:12px; border-radius:8px; background:var(--bg); color:var(--text); border:1px solid var(--border); font-size:16px;">${options}</select></div>
                <div class="form-group"><label>Позиция</label>
                  <select name="targetPos" style="width:100%; padding:12px; border-radius:8px; background:var(--bg); color:var(--text); border:1px solid var(--border); font-size:16px;">
                    <option value="start">В начало очереди</option>
                    <option value="end">В конец очереди</option>
                  </select>
                </div>
              `, 'Переместить', async (ov) => {
                const f = ov.querySelector('form');
                const targetId = f.targetMachine.value;
                const posRule = f.targetPos.value;
                
                await deleteItem('tasks', task.id);
                const targetTasks = state.allTasks.filter(t => t.machineId === targetId).sort((a,b) => a.pos - b.pos);
                task.machineId = targetId;
                
                if (posRule === 'start') {
                  task.pos = 1;
                  for (let t of targetTasks) { t.pos += 1; await put('tasks', t); }
                } else {
                  task.pos = targetTasks.length + 1;
                }
                await put('tasks', task);
                render(); return true;
              });
            };

            overlay.querySelector('#act-cancel').onclick = () => {
              overlay.remove();
              if (!confirm(`Отменить задачу "${task.partName}"?\n\nУже сделано: ${task.done}. Остаток ${remaining} будет списан. Записи о выполнении останутся в истории.`)) return;
              
              const cancelRecord = {
                id: 'hist_' + Date.now(), type: 'cancel', machineId: id,
                machineSnapshot: `${state.machines.find(x => x.id === id).number}. ${state.machines.find(x => x.id === id).model}`,
                orderNo: task.orderNo, partName: task.partName, total: task.total, qty: remaining, eventDate: formatDate(new Date()), 
                isUrgent: task.isUrgent, note: task.note,
                linkedTaskId: task.id, status: 'active'
              };
              
              deleteItem('tasks', task.id).then(() => put('history', cancelRecord)).then(() => {
                render();
                showToast(`Задача отменена`, 'Вернуть', async () => {
                  await deleteItem('history', cancelRecord.id);
                  await put('tasks', task);
                  render();
                });
              });
            };
          }, 50);
        };
      });
    }
  },
  orders: {
    title: 'Заказы',
    render: () => {
      return `
        <input type="text" class="search-input" id="search-order" placeholder="Введите номер заказа (например 69.27)" value="${state.searchOrder}">
        <div id="search-results"></div>
      `;
    },
    afterRender: () => {
      const input = document.getElementById('search-order');
      const results = document.getElementById('search-results');
      
      const doSearch = () => {
        state.searchOrder = input.value.trim();
        if (!state.searchOrder) { results.innerHTML = ''; return; }
        
        const norm = normalizeOrderNo(state.searchOrder).value;
        
        const activeTasks = state.allTasks.filter(t => t.orderNo.includes(norm)).sort((a,b) => a.orderNo.localeCompare(b.orderNo));
        const historyItems = state.history.filter(h => h.orderNo.includes(norm) && h.status === 'active').sort((a,b) => new Date(b.eventDate) - new Date(a.eventDate));
        
        let html = '';
        
        if (activeTasks.length > 0) {
          html += '<div class="order-section"><h3>В очереди</h3>';
          activeTasks.forEach(t => {
            const m = state.machines.find(x => x.id === t.machineId);
            html += `<div class="order-item">
              <span style="color:var(--accent); font-weight:600">Заказ ${t.orderNo}</span> · ${t.partName} ${t.isUrgent ? '🚨' : ''}<br>
              <span style="color:var(--text-muted); font-size:14px;">Станок: ${m ? m.number + '. ' + m.model : '?'} · Позиция №${t.pos} · Осталось: ${t.total - t.done}(${t.total})</span>
              ${t.note ? `<br><span style="font-size:13px; font-style:italic; color:var(--text-muted)">📝 ${t.note}</span>` : ''}
            </div>`;
          });
          html += '</div>';
        }
        
        if (historyItems.length > 0) {
          html += '<div class="order-section"><h3>История</h3>';
          historyItems.forEach(h => {
            const isCancel = h.type === 'cancel';
            html += `<div class="order-item">
              <span style="color:var(--accent); font-weight:600">Заказ ${h.orderNo}</span> · ${h.partName}<br>
              <span style="color:var(--text-muted); font-size:14px;">${h.machineSnapshot} · ${h.eventDate} · </span>
              <span class="history-qty ${isCancel ? 'cancel' : ''}">${isCancel ? 'Отменено (' + h.qty + ')' : h.qty + '/' + h.total}</span>
              ${h.note ? `<br><span style="font-size:13px; font-style:italic; color:var(--text-muted)">📝 ${h.note}</span>` : ''}
            </div>`;
          });
          html += '</div>';
        }
        
        if (html === '') { html = '<div class="placeholder">Ничего не найдено</div>'; }
        results.innerHTML = html;
      };
      
      input.addEventListener('input', doSearch);
      if (state.searchOrder) doSearch();
    }
  },
  history: {
    title: 'История',
    render: () => {
      return `
        <div style="display:flex; gap:8px; margin-bottom: 12px; align-items:center;">
          <input type="date" id="hist-start" class="search-input" value="${state.historyStartDate}" style="margin-bottom:0; flex:1;">
          <span style="color:var(--text-muted)">—</span>
          <input type="date" id="hist-end" class="search-input" value="${state.historyEndDate}" style="margin-bottom:0; flex:1;">
        </div>
        <div style="text-align:right; margin-bottom: 12px;">
          <button class="btn-small" id="btn-all-history">Показать все</button>
        </div>
        <div id="history-list"></div>
      `;
    },
    afterRender: () => {
      const list = document.getElementById('history-list');
      
      const renderList = () => {
        let filtered = state.history.filter(h => h.status === 'active');
        
        if (state.historyStartDate) {
          filtered = filtered.filter(h => h.eventDate >= state.historyStartDate);
        }
        if (state.historyEndDate) {
          filtered = filtered.filter(h => h.eventDate <= state.historyEndDate);
        }

        filtered.sort((a,b) => new Date(b.eventDate) - new Date(a.eventDate));

        if (filtered.length === 0) {
          list.innerHTML = '<div class="placeholder">За выбранный период история пуста</div>';
          return;
        }

        list.innerHTML = filtered.map(h => {
          const isCancel = h.type === 'cancel';
          return `
            <div class="history-card">
              <div class="history-header">
                <span>${h.eventDate} · ${h.machineSnapshot}</span>
                <span style="color:var(--accent); font-weight:600">Заказ ${h.orderNo}</span>
              </div>
              <div class="history-part">${h.partName} ${h.isUrgent ? '🚨' : ''}</div>
              <div class="history-qty ${isCancel ? 'cancel' : ''}">
                ${isCancel ? '✕ Отменено (остаток ' + h.qty + ')' : '✓ Сделано ' + h.qty + ' из ' + h.total}
              </div>
              ${h.note ? `<div style="font-size:13px; font-style:italic; color:var(--text-muted); margin-top:4px;">📝 ${h.note}</div>` : ''}
              <div class="history-actions">
                <button class="btn-small btn-return" data-id="${h.id}">
                  ${isCancel ? 'Возобновить в очередь' : 'Вернуть в очередь'}
                </button>
              </div>
            </div>
          `;
        }).join('');

        document.querySelectorAll('.btn-return').forEach(btn => {
          btn.onclick = () => {
            const histItem = state.history.find(x => x.id === btn.dataset.id);
            
            openModal('Вернуть в очередь', `
              <div style="margin-bottom:15px; font-size:15px;">
                Задача: <strong>${histItem.partName}</strong><br>
                Заказ: ${histItem.orderNo}<br>
                Возвращается: <strong>${histItem.qty}</strong> шт.
              </div>
              <div class="form-group">
                <label>Куда добавить</label>
                <select name="targetPos" style="width:100%; padding:12px; border-radius:8px; background:var(--bg); color:var(--text); border:1px solid var(--border); font-size:16px;">
                  <option value="start">В начало очереди</option>
                  <option value="end">В конец очереди</option>
                </select>
              </div>
            `, 'Вернуть', async (overlay) => {
              const posRule = overlay.querySelector('select[name="targetPos"]').value;
              let existingTask = state.allTasks.find(t => t.id === histItem.linkedTaskId);
              
              if (existingTask) {
                existingTask.done -= histItem.qty;
                if (existingTask.done < 0) existingTask.done = 0;
                await put('tasks', existingTask);
              } else {
                const machineTasks = state.allTasks.filter(t => t.machineId === histItem.machineId).sort((a,b) => a.pos - b.pos);
                let newPos = posRule === 'start' ? 1 : machineTasks.length + 1;
                
                if (posRule === 'start') {
                  for (let t of machineTasks) { t.pos += 1; await put('tasks', t); }
                }

                const newTask = {
                  id: 'task_' + Date.now(), 
                  machineId: histItem.machineId, 
                  pos: newPos, 
                  orderNo: histItem.orderNo, 
                  partName: histItem.partName, 
                  total: histItem.total, 
                  done: histItem.total - histItem.qty,
                  isUrgent: histItem.isUrgent || false,
                  note: histItem.note || '',
                  createdAt: new Date().toISOString()
                };
                await put('tasks', newTask);
              }
              
              histItem.status = 'returned';
              await put('history', histItem);
              
              render();
              showToast('Возвращено в очередь');
              return true;
            });
          };
        });
      };

      document.getElementById('hist-start').onchange = (e) => {
        state.historyStartDate = e.target.value;
        renderList();
      };
      document.getElementById('hist-end').onchange = (e) => {
        state.historyEndDate = e.target.value;
        renderList();
      };
      document.getElementById('btn-all-history').onclick = () => {
        state.historyStartDate = '';
        state.historyEndDate = '';
        document.getElementById('hist-start').value = '';
        document.getElementById('hist-end').value = '';
        renderList();
      };

      renderList();
    }
  },
  settings: {
    title: 'Настройки',
    render: () => {
      const cur = localStorage.getItem('theme') || 'auto';
      const sorted = [...state.machines].sort((a, b) => a.order - b.order);
      
      let mHtml = '<div class="card"><h3>Порядок станков</h3>';
      sorted.forEach((m, i) => {
        mHtml += `
          <div style="display:flex; justify-content:space-between; align-items:center; padding:8px 0; border-bottom:1px solid var(--border);">
            <span>${m.number}. ${m.model}</span>
            <div>
              <button class="btn-move" data-id="${m.id}" data-dir="up" ${i === 0 ? 'disabled style="opacity:0.3"' : ''} style="background:var(--border); border:none; padding:5px 10px; border-radius:5px; margin-right:5px; font-size:16px;">▲</button>
              <button class="btn-move" data-id="${m.id}" data-dir="down" ${i === sorted.length - 1 ? 'disabled style="opacity:0.3"' : ''} style="background:var(--border); border:none; padding:5px 10px; border-radius:5px; font-size:16px;">▼</button>
            </div>
          </div>
        `;
      });
      mHtml += '</div>';

      return `
        <div class="card">
          <h3>Тема</h3>
          <label><input type="radio" name="theme" value="auto" ${cur === 'auto' ? 'checked' : ''}> Системная</label>
          <label><input type="radio" name="theme" value="light" ${cur === 'light' ? 'checked' : ''}> Светлая</label>
          <label><input type="radio" name="theme" value="dark" ${cur === 'dark' ? 'checked' : ''}> Тёмная</label>
        </div>
        ${mHtml}
        <div class="card">
          <h3>Данные</h3>
          <button class="btn-block" id="btn-export-excel">📊 Экспорт в Excel (xlsx)</button>
          <button class="btn-block" id="btn-backup">💾 Сохранить резервную копию</button>
          <button class="btn-block" id="btn-restore">📂 Загрузить копию</button>
          <input type="file" id="file-restore" accept=".json" style="display:none;">
        </div>
        <div class="placeholder" style="padding:20px 0;">Версия 1.7 · быстрые действия</div>
      `;
    },
    afterRender: () => {
      document.querySelectorAll('input[name="theme"]').forEach((r) => {
        r.addEventListener('change', () => { localStorage.setItem('theme', r.value); applyTheme(); });
      });
      
      document.querySelectorAll('.btn-move').forEach(btn => {
        btn.onclick = async () => {
          const id = btn.dataset.id;
          const dir = btn.dataset.dir;
          const sorted = [...state.machines].sort((a, b) => a.order - b.order);
          const idx = sorted.findIndex(m => m.id === id);
          if (dir === 'up' && idx > 0) {
            const swap = sorted[idx - 1];
            const temp = sorted[idx].order;
            sorted[idx].order = swap.order; swap.order = temp;
            await put('machines', sorted[idx]); await put('machines', swap);
          } else if (dir === 'down' && idx < sorted.length - 1) {
            const swap = sorted[idx + 1];
            const temp = sorted[idx].order;
            sorted[idx].order = swap.order; swap.order = temp;
            await put('machines', sorted[idx]); await put('machines', swap);
          }
          state.machines = await getAll('machines');
          render();
        };
      });

      document.getElementById('btn-export-excel').onclick = () => {
        if (typeof XLSX === 'undefined') {
          showToast('Ошибка: библиотека Excel не загрузилась'); return;
        }
        
        const wb = XLSX.utils.book_new();
        const historyActive = state.history.filter(h => h.status === 'active');

        const wsDoneData = [['Дата', 'Станок', 'Заказ', 'Деталь', 'Сделано', 'Всего', 'Срочно', 'Заметка']];
        historyActive.filter(h => h.type === 'done').forEach(h => {
          wsDoneData.push([h.eventDate, h.machineSnapshot, h.orderNo, h.partName, h.qty, h.total, h.isUrgent ? 'Да' : '', h.note || '']);
        });
        const wsDone = XLSX.utils.aoa_to_sheet(wsDoneData);
        XLSX.utils.book_append_sheet(wb, wsDone, 'Выполнено');

        const summary = {};
        historyActive.filter(h => h.type === 'done').forEach(h => {
          const key = h.orderNo + '|' + h.partName;
          if (!summary[key]) summary[key] = { orderNo: h.orderNo, partName: h.partName, done: 0, total: h.total };
          summary[key].done += h.qty;
        });
        const wsSummaryData = [['Заказ', 'Деталь', 'Сделано', 'Всего в заказе']];
        Object.values(summary).forEach(s => {
          const doneStr = s.done >= s.total ? s.total.toString() : `${s.done}(${s.total})`;
          wsSummaryData.push([s.orderNo, s.partName, doneStr, s.total]);
        });
        const wsSummary = XLSX.utils.aoa_to_sheet(wsSummaryData);
        XLSX.utils.book_append_sheet(wb, wsSummary, 'По заказам');

        const wsCancelData = [['Дата', 'Станок', 'Заказ', 'Деталь', 'Остаток', 'Заметка']];
        historyActive.filter(h => h.type === 'cancel').forEach(h => {
          wsCancelData.push([h.eventDate, h.machineSnapshot, h.orderNo, h.partName, h.qty, h.note || '']);
        });
        const wsCancel = XLSX.utils.aoa_to_sheet(wsCancelData);
        XLSX.utils.book_append_sheet(wb, wsCancel, 'Отменено');

        XLSX.writeFile(wb, `Отчет_${formatDate(new Date())}.xlsx`);
      };

      document.getElementById('btn-backup').onclick = async () => {
        const data = {
          version: 1, exportDate: new Date().toISOString(),
          machines: state.machines, tasks: state.allTasks, history: state.history
        };
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `backup_${formatDate(new Date())}.json`;
        a.click();
        URL.revokeObjectURL(url);
        showToast('Копия сохранена');
      };

      const fileInput = document.getElementById('file-restore');
      document.getElementById('btn-restore').onclick = () => fileInput.click();
      
      fileInput.onchange = (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = async (ev) => {
          try {
            const data = JSON.parse(ev.target.result);
            if (!data.machines || !data.tasks || !data.history) throw new Error('Неверный формат файла');
            if (!confirm('ВНИМАНИЕ! Все текущие данные будут заменены данными из файла. Продолжить?')) return;

            const db = await openDB();
            const tx = db.transaction(['machines', 'tasks', 'history'], 'readwrite');
            tx.objectStore('machines').clear();
            tx.objectStore('tasks').clear();
            tx.objectStore('history').clear();
            
            data.machines.forEach(m => tx.objectStore('machines').put(m));
            data.tasks.forEach(t => tx.objectStore('tasks').put(t));
            data.history.forEach(h => tx.objectStore('history').put(h));
            
            tx.oncomplete = async () => {
              showToast('Данные успешно восстановлены');
              state.machines = await getAll('machines');
              render();
            };
          } catch (err) {
            alert('Ошибка чтения файла: ' + err.message);
          }
        };
        reader.readAsText(file);
      };
    }
  }
};

// ---- Роутинг ----
async function render() {
  const hash = location.hash || '#/overview';
  const m = hash.match(/^#\/(\w+)(?:\/(.+))?/);
  const route = m ? m[1] : 'overview';
  const param = m ? m[2] : null;

  state.allTasks = await getAll('tasks');
  state.history = await getAll('history');

  if (route === 'machine' && param) {
    state.currentMachineTasks = await getTasksByMachine(param);
    const machine = state.machines.find(x => x.id === param);
    document.getElementById('app-title').textContent = machine ? `${machine.number}. ${machine.model}` : 'Станок';
    
    const btnBack = document.getElementById('btn-back');
    btnBack.style.display = 'block';
    btnBack.onclick = () => {
      history.replaceState(null, '', '#/machines');
      render();
    };
    document.getElementById('tabbar').style.display = 'none';
  } else {
    document.getElementById('app-title').textContent = screens[route]?.title || 'Учет';
    document.getElementById('btn-back').style.display = 'none';
    document.getElementById('tabbar').style.display = 'flex';
  }

  const screen = screens[route] || screens.overview;
  document.getElementById('app-main').innerHTML = screen.render(param);
  
  document.querySelectorAll('#tabbar a').forEach((a) => {
    a.classList.toggle('active', a.dataset.tab === route || (route === 'machine' && a.dataset.tab === 'machines'));
  });

  if (typeof screen.afterRender === 'function') screen.afterRender(param);
}

window.addEventListener('hashchange', render);

document.getElementById('tabbar').addEventListener('click', (e) => {
  const a = e.target.closest('a');
  if (!a) return;
  e.preventDefault();
  const targetHash = `#/${a.dataset.tab}`;
  if (location.hash !== targetHash) {
    history.replaceState(null, '', targetHash);
    render();
  }
});

async function init() {
  try {
    await openDB();
    await seedDB();
    state.machines = await getAll('machines');
    
    const today = formatDate(new Date());
    state.historyStartDate = today;
    state.historyEndDate = today;

    if (!location.hash) {
      history.replaceState(null, '', '#/overview');
    }
    await render();
  } catch (err) {
    document.getElementById('app-main').innerHTML = `<div class="placeholder" style="color:red">Ошибка: ${err.message}</div>`;
  }
}

init();

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(console.warn));
}
