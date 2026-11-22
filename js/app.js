// --- Защита от белого экрана ---
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
  machines: [], currentMachineTasks: [], allTasks: [], history: [],
  parts: [], toolings: [], 
  historyStartDate: '', historyEndDate: '', searchOrder: '',
  dataSubTab: 'parts' // 'parts' | 'toolings' | 'orders'
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

// Сжатие фото
function compressImage(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const max_size = 800;
        let width = img.width;
        let height = img.height;
        if (width > height) {
          if (width > max_size) { height *= max_size / width; width = max_size; }
        } else {
          if (height > max_size) { width *= max_size / height; height = max_size; }
        }
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', 0.7)); 
      };
      img.onerror = reject;
      img.src = e.target.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
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
  setTimeout(() => { if (toast.parentNode) toast.remove(); }, 3000);
}

function openModal(title, contentHTML, confirmText, onSubmit) {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal">
      <h3>${title}</h3>
      <form id="modal-form" novalidate>
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
      document.getElementById('btn-add-task').onclick = () => {
        openModal('Новая задача', `
          <div class="form-group">
            <label>Номер заказа (NN.NN)</label>
            <input type="text" name="orderNo" placeholder="69.27">
            <div class="hint" id="order-hint"></div>
          </div>
          <div class="form-group">
            <label>Название детали</label>
            <input type="text" name="partName" placeholder="Вал 20х100">
          </div>
          <div class="form-group">
            <label>Количество</label>
            <input type="number" name="total" value="1">
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

          if (!orderNo || !partName) { showToast('Заполните номер заказа и название детали'); return false; }
          if (isNaN(total) || total < 1) { showToast('Количество должно быть больше 0'); return false; }
          
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

      document.querySelectorAll('.btn-check').forEach(btn => {
        btn.onclick = () => {
          const task = state.currentMachineTasks.find(t => t.id === btn.dataset.id);
          const remaining = task.total - task.done;
          const today = formatDate(new Date());

          openModal('Выполнено?', `
            <div style="margin-bottom:12px; font-size:15px; color:var(--text-muted)">
              Заказ ${task.orderNo} · ${task.partName}<br>Осталось сделать: <strong style="color:var(--warn)">${remaining}</strong> (всего ${task.total})
            </div>
            <div class="form-group"><label>Сколько сделано</label><input type="number" name="qty" value="${remaining}"></div>
            <div class="form-group"><label>Дата выполнения</label><input type="date" name="eventDate" value="${today}"></div>
          `, 'Подтвердить', async (overlay) => {
            const form = overlay.querySelector('form');
            const qty = parseInt(form.qty.value, 10);
            const eventDate = form.eventDate.value;
            
            if (isNaN(qty) || qty <= 0 || qty > remaining) { showToast(`Введите число от 1 до ${remaining}`); return false; }
            if (!eventDate) { showToast('Укажите дату выполнения'); return false; }

            const historyRecord = {
              id: 'hist_' + Date.now(), type: 'done', machineId: id,
              machineSnapshot: `${state.machines.find(x => x.id === id).number}. ${state.machines.find(x => x.id === id).model}`,
              orderNo: task.orderNo, partName: task.partName, total: task.total, qty: qty, eventDate, 
              isUrgent: task.isUrgent, note: task.note, linkedTaskId: task.id, status: 'active'
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
            });
            return true;
          });
        };
      });

      document.querySelectorAll('.btn-menu').forEach(btn => {
        btn.onclick = () => {
          const task = state.currentMachineTasks.find(t => t.id === btn.dataset.id);
          const remaining = task.total - task.done;
          
          const isFirst = state.currentMachineTasks[0].id === task.id;
          const isLast = state.currentMachineTasks[state.currentMachineTasks.length - 1].id === task.id;

          let moveHtml = '';
          if (!isFirst) moveHtml += `<button type="button" class="btn btn-secondary" id="act-up" style="width:100%; text-align:left; padding:15px; margin-bottom:10px;">⬆️ Поднять в очереди</button>`;
          if (!isLast) moveHtml += `<button type="button" class="btn btn-secondary" id="act-down" style="width:100%; text-align:left; padding:15px; margin-bottom:10px;">⬇️ Опустить в очереди</button>`;

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
            
            overlay.querySelector('#act-urgent').onclick = async () => {
              task.isUrgent = !task.isUrgent;
              await put('tasks', task);
              overlay.remove();
              render();
            };

            overlay.querySelector('#act-note').onclick = () => {
              overlay.remove();
              openModal('Заметка к задаче', `
                <div class="form-group">
                  <label>Текст заметки</label>
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
                const temp = task.pos; task.pos = prevTask.pos; prevTask.pos = temp;
                await put('tasks', task); await put('tasks', prevTask);
                overlay.remove(); render();
              };
            }

            const btnDown = overlay.querySelector('#act-down');
            if (btnDown) {
              btnDown.onclick = async () => {
                const idx = state.currentMachineTasks.findIndex(t => t.id === task.id);
                const nextTask = state.currentMachineTasks[idx + 1];
                const temp = task.pos; task.pos = nextTask.pos; nextTask.pos = temp;
                await put('tasks', task); await put('tasks', nextTask);
                overlay.remove(); render();
              };
            }

            overlay.querySelector('#act-edit').onclick = () => {
              overlay.remove();
              openModal('Редактировать задачу', `
                <div class="form-group"><label>Номер заказа</label><input type="text" name="orderNo" value="${task.orderNo}"></div>
                <div class="form-group"><label>Название детали</label><input type="text" name="partName" value="${task.partName}"></div>
                <div class="form-group"><label>Всего нужно</label><input type="number" name="total" value="${task.total}"></div>
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
                const newTotal = parseInt(f.total.value, 10);
                task.orderNo = orderNo; task.partName = f.partName.value.trim(); task.total = newTotal;
                task.isUrgent = f.isUrgent.checked; task.note = f.note.value.trim();
                await put('tasks', task);
                render(); return true;
              });
            };

            overlay.querySelector('#act-move').onclick = () => {
              overlay.remove();
              const otherMachines = state.machines.filter(m => m.id !== id).sort((a,b) => a.order - b.order);
              const options = otherMachines.map(m => `<option value="${m.id}">${m.number}. ${m.model}</option>`).join('');
              
              openModal('Переместить', `
                <div class="form-group"><label>Выберите станок</label><select name="targetMach
