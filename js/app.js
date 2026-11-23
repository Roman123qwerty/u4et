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
  dataSubTab: 'parts'
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
          // Проверяем, есть ли деталь в базе для ссылки
          const partLink = t.partId ? `<a href="#/part/${t.partId}" class="task-part linked">${t.partName}</a>` : `<div class="task-part">${t.partName}</div>`;
          
          html += `
            <div class="task-card ${t.isUrgent ? 'urgent' : ''}">
              <div class="task-content">
                <div class="task-header">
                  <span>№${index + 1}</span>
                  <span class="task-order">Заказ ${t.orderNo}</span>
                  ${t.isUrgent ? '<span class="urgent-badge">СРОЧНО</span>' : ''}
                </div>
                ${partLink}
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
      // ДОБАВЛЕНИЕ ЗАДАЧИ С АВТОДОПОЛНЕНИЕМ
      document.getElementById('btn-add-task').onclick = () => {
        let selectedPartId = null; // Сюда сохраняем ID выбранной детали
        
        openModal('Новая задача', `
          <div class="form-group">
            <label>Номер заказа (NN.NN)</label>
            <input type="text" name="orderNo" placeholder="69.27">
            <div class="hint" id="order-hint"></div>
          </div>
          <div class="form-group autocomplete-container">
            <label>Название детали</label>
            <input type="text" name="partName" id="task-part-input" placeholder="Введите название..." autocomplete="off">
            <div id="autocomplete-list" class="autocomplete-list"></div>
          </div>
          <div class="form-group" id="add-to-db-container" style="display:none; margin-top:-8px; margin-bottom:14px;">
            <label class="checkbox-label" style="font-size:14px; color:var(--accent);">
              <input type="checkbox" name="addToDB"> Внести деталь в базу
            </label>
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
          
          let partName = form.partName.value.trim();
          let total = parseInt(form.total.value, 10);
          const isUrgent = form.isUrgent.checked;
          const note = form.note.value.trim();
          const addToDB = form.addToDB ? form.addToDB.checked : false;

          if (!orderNo || !partName) { showToast('Заполните номер заказа и название детали'); return false; }
          if (isNaN(total) || total < 1) { showToast('Количество должно быть больше 0'); return false; }
          
          // Если пользователь ввел вручную и поставил галочку "Внести в базу"
          if (addToDB && !selectedPartId) {
            const newPartId = 'part_' + Date.now();
            await put('parts', { id: newPartId, name: partName, note: '', toolingIds: [], machineIds: [id], photo: '' });
            selectedPartId = newPartId;
          }

          if (state.currentMachineTasks.some(t => t.orderNo === orderNo && t.partName.toLowerCase() === partName.toLowerCase())) {
            if (!confirm(`Задача "${partName}" по заказу ${orderNo} уже есть в очереди. Всё равно добавить?`)) return false;
          }

          const newTask = { 
            id: 'task_' + Date.now(), machineId: id, pos: state.currentMachineTasks.length + 1, 
            orderNo, partName, total, done: 0, isUrgent, note,
            partId: selectedPartId, // Привязываем ID детали (если есть)
            createdAt: new Date().toISOString() 
          };
          await put('tasks', newTask);
          render();
          return true;
        });

        // Логика работы выпадающего списка
        setTimeout(() => {
          const input = document.getElementById('task-part-input');
          const list = document.getElementById('autocomplete-list');
          const dbContainer = document.getElementById('add-to-db-container');
          const orderInput = document.querySelector('input[name="orderNo"]');
          const hint = document.getElementById('order-hint');

          // Валидация заказа
          orderInput.addEventListener('input', () => {
            const { warning } = normalizeOrderNo(orderInput.value);
            hint.textContent = warning || ''; hint.style.display = warning ? 'block' : 'none';
          });

          // Автодополнение
          input.addEventListener('input', () => {
            const val = input.value.toLowerCase().trim();
            list.innerHTML = '';
            selectedPartId = null; // Сбрасываем выбор при ручном вводе
            dbContainer.style.display = 'none';

            if (!val) { list.style.display = 'none'; return; }

            const matches = state.parts.filter(p => p.name.toLowerCase().includes(val)).slice(0, 10);
            
            if (matches.length > 0) {
              list.style.display = 'block';
              matches.forEach(p => {
                const div = document.createElement('div');
                div.className = 'autocomplete-item';
                div.innerHTML = `<div class="ac-title">${p.name}</div>`;
                div.onclick = () => {
                  input.value = p.name;
                  selectedPartId = p.id;
                  list.style.display = 'none';
                  dbContainer.style.display = 'none'; // Скрываем галочку, т.к. деталь уже в базе
                };
                list.appendChild(div);
              });
            } else {
              list.style.display = 'none';
              // Если совпадений нет и это новая деталь, показываем галочку
              if (val.length > 2) dbContainer.style.display = 'block';
            }
          });

          // Скрываем список при клике вне его
          input.addEventListener('blur', () => {
            setTimeout(() => { list.style.display = 'none'; }, 200);
          });
        }, 100);
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

      // МЕНЮ (⋯) - сокращено для читаемости, логика идентична v28
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
              await put('tasks', task); overlay.remove(); render();
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
                await put('tasks', task); render(); return true;
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
                <div class="form-group"><label>Выберите станок</label><select name="targetMachine">${options}</select></div>
                <div class="form-group"><label>Позиция</label>
                  <select name="targetPos"><option value="start">В начало</option><option value="end">В конец</option></select>
                </div>
              `, 'Переместить', async (ov) => {
                const f = ov.querySelector('form');
                const targetId = f.targetMachine.value;
                const posRule = f.targetPos.value;
                await deleteItem('tasks', task.id);
                const targetTasks = state.allTasks.filter(t => t.machineId === targetId).sort((a,b) => a.pos - b.pos);
                task.machineId = targetId;
                if (posRule === 'start') { task.pos = 1; for (let t of targetTasks) { t.pos += 1; await put('tasks', t); } } 
                else { task.pos = targetTasks.length + 1; }
                await put('tasks', task);
                render(); return true;
              });
            };

            overlay.querySelector('#act-cancel').onclick = () => {
              overlay.remove();
              if (!confirm(`Отменить задачу "${task.partName}"?`)) return;
              const cancelRecord = {
                id: 'hist_' + Date.now(), type: 'cancel', machineId: id,
                machineSnapshot: `${state.machines.find(x => x.id === id).number}. ${state.machines.find(x => x.id === id).model}`,
                orderNo: task.orderNo, partName: task.partName, total: task.total, qty: remaining, eventDate: formatDate(new Date()), 
                isUrgent: task.isUrgent, note: task.note, linkedTaskId: task.id, status: 'active'
              };
              deleteItem('tasks', task.id).then(() => put('history', cancelRecord)).then(() => { render(); });
            };
          }, 50);
        };
      });
    }
  },
  data: {
    title: 'Данные',
    render: () => {
      let subTabsHtml = `
        <div class="sub-tabs">
          <div class="sub-tab ${state.dataSubTab === 'parts' ? 'active' : ''}" onclick="window.switchDataTab('parts')">Детали</div>
          <div class="sub-tab ${state.dataSubTab === 'toolings' ? 'active' : ''}" onclick="window.switchDataTab('toolings')">Оснастка</div>
          <div class="sub-tab ${state.dataSubTab === 'orders' ? 'active' : ''}" onclick="window.switchDataTab('orders')">Заказы</div>
        </div>
      `;

      let contentHtml = '';

      if (state.dataSubTab === 'parts') {
        let list = state.parts.sort((a,b) => a.name.localeCompare(b.name));
        contentHtml = `
          <input type="text" class="search-input" id="search-part" placeholder="Поиск детали по названию" value="${state.searchPart || ''}">
          <div id="parts-list">
            ${list.length === 0 ? '<div class="placeholder">Справочник пуст</div>' : ''}
            ${list.map(p => `
              <div class="list-item" onclick="location.hash='#/part/${p.id}'">
                <div style="display:flex; align-items:center; gap:12px;">
                  ${p.photo ? `<img src="${p.photo}" style="width:40px; height:40px; object-fit:cover; border-radius:6px;">` : '<div style="width:40px; height:40px; background:var(--border); border-radius:6px; display:flex; align-items:center; justify-content:center; font-size:10px; color:var(--text-muted);">Нет фото</div>'}
                  <div>
                    <div class="list-item-title">${p.name}</div>
                    <div class="list-item-subtitle">Оснасток: ${p.toolingIds?.length || 0} · Станков: ${p.machineIds?.length || 0}</div>
                  </div>
                </div>
                <div>›</div>
              </div>
            `).join('')}
          </div>
          <button class="fab" onclick="location.hash='#/part/new'">+</button>
        `;
      } else if (state.dataSubTab === 'toolings') {
        let list = state.toolings.sort((a,b) => a.code.localeCompare(b.code));
        contentHtml = `
          <input type="text" class="search-input" id="search-tooling" placeholder="Поиск оснастки по шифру" value="${state.searchTooling || ''}">
          <div id="toolings-list">
            ${list.length === 0 ? '<div class="placeholder">Справочник пуст</div>' : ''}
            ${list.map(t => `
              <div class="list-item" onclick="location.hash='#/tooling/${t.id}'">
                <div style="display:flex; align-items:center; gap:12px;">
                  ${t.photo ? `<img src="${t.photo}" style="width:40px; height:40px; object-fit:cover; border-radius:6px;">` : '<div style="width:40px; height:40px; background:var(--border); border-radius:6px; display:flex; align-items:center; justify-content:center; font-size:10px; color:var(--text-muted);">Нет фото</div>'}
                  <div>
                    <div class="list-item-title">${t.code}</div>
                    <div class="list-item-subtitle">${t.name || 'Без названия'}</div>
                  </div>
                </div>
                <div>›</div>
              </div>
            `).join('')}
          </div>
          <button class="fab" onclick="location.hash='#/tooling/new'">+</button>
        `;
      } else if (state.dataSubTab === 'orders') {
        contentHtml = `
          <input type="text" class="search-input" id="search-order" placeholder="Введите номер заказа (например 69.27)" value="${state.searchOrder}">
          <div id="search-results"></div>
        `;
      }

      return subTabsHtml + contentHtml;
    },
    afterRender: () => {
      if (state.dataSubTab === 'parts') {
        const input = document.getElementById('search-part');
        if (input) input.addEventListener('input', (e) => {
          const q = e.target.value.toLowerCase();
          document.querySelectorAll('#parts-list .list-item').forEach(el => {
            const text = el.querySelector('.list-item-title').textContent.toLowerCase();
            el.style.display = text.includes(q) ? 'flex' : 'none';
          });
        });
      }
      if (state.dataSubTab === 'toolings') {
        const input = document.getElementById('search-tooling');
        if (input) input.addEventListener('input', (e) => {
          const q = e.target.value.toLowerCase();
          document.querySelectorAll('#toolings-list .list-item').forEach(el => {
            const text = el.querySelector('.list-item-title').textContent.toLowerCase();
            el.style.display = text.includes(q) ? 'flex' : 'none';
          });
        });
      }
      if (state.dataSubTab === 'orders') {
        const input = document.getElementById('search-order');
        const results = document.getElementById('search-results');
        if (!input) return;
        
        const doSearch = () => {
          state.searchOrder = input.value.trim();
          if (!state.searchOrder) { results.innerHTML = ''; return; }
          const norm = normalizeOrderNo(state.searchOrder).value;
          const activeTasks = state.allTasks.filter(t => t.orderNo.includes(norm)).sort((a,b) => a.orderNo.localeCompare(b.orderNo));
          let html = '';
          if (activeTasks.length > 0) {
            html += '<div class="order-section"><h3>В очереди</h3>';
            activeTasks.forEach(t => {
              const m = state.machines.find(x => x.id === t.machineId);
              html += `<div class="order-item">
                <span style="color:var(--accent); font-weight:600">Заказ ${t.orderNo}</span> · ${t.partName}<br>
                <span style="color:var(--text-muted); font-size:14px;">Станок: ${m ? m.number + '. ' + m.model : '?'} · Позиция №${t.pos} · Осталось: ${t.total - t.done}(${t.total})</span>
              </div>`;
            });
            html += '</div>';
          }
          if (html === '') html = '<div class="placeholder">Ничего не найдено</div>';
          results.innerHTML = html;
        };
        input.addEventListener('input', doSearch);
        if (state.searchOrder) doSearch();
      }
    }
  },
  part: {
    title: 'Деталь',
    render: (id, action) => {
      const isNew = id === 'new';
      const isEdit = action === 'edit' || isNew;
      const part = isNew ? { name: '', note: '', toolingIds: [], machineIds: [], photo: '' } : state.parts.find(p => p.id === id);
      if (!part) return '<div class="placeholder">Деталь не найдена</div>';

      if (!isEdit) {
        // РЕЖИМ ПРОСМОТРА
        const tNames = (part.toolingIds || []).map(tid => state.toolings.find(t => t.id === tid)?.code).filter(Boolean).join(', ');
        const mNames = (part.machineIds || []).map(mid => {
          const m = state.machines.find(x => x.id === mid);
          return m ? `${m.number}. ${m.model}` : null;
        }).filter(Boolean).join(', ');
        
        return `
          <div class="card" style="margin-top:0;">
            ${part.photo ? `<img src="${part.photo}" class="photo-preview">` : ''}
            <h2 style="margin-bottom:16px;">${part.name}</h2>
            <div class="form-group">
              <label>Заметка</label>
              <div style="padding:12px; background:var(--bg); border-radius:8px; min-height:44px;">${part.note || '<span style="color:var(--text-muted)">Нет</span>'}</div>
            </div>
            <div class="form-group">
              <label>Оснастка</label>
              <div style="padding:12px; background:var(--bg); border-radius:8px; min-height:44px;">${tNames || '<span style="color:var(--text-muted)">Не привязана</span>'}</div>
            </div>
            <div class="form-group">
              <label>Станки, где делали</label>
              <div style="padding:12px; background:var(--bg); border-radius:8px; min-height:44px;">${mNames || '<span style="color:var(--text-muted)">Нет</span>'}</div>
            </div>
            <div class="modal-actions" style="margin-top:20px; flex-direction:column;">
              <button type="button" class="btn btn-primary" id="btn-add-task-from-part" style="margin-bottom:10px;">➕ Добавить в задание</button>
              <div style="display:flex; gap:10px;">
                <button type="button" class="btn btn-secondary" onclick="location.hash='#/part/${part.id}/edit'">✏️ Редактировать</button>
                <button type="button" class="btn" id="btn-delete-part" style="background:var(--danger); color:#fff;">Удалить</button>
              </div>
            </div>
          </div>
        `;
      }

      // РЕЖИМ РЕДАКТИРОВАНИЯ (сокращено, логика идентична v28)
      return `
        <div class="card" style="margin-top:0;">
          <div class="form-group">
            <label>Фото детали</label>
            ${part.photo ? `<img src="${part.photo}" class="photo-preview" id="photo-img">` : `<div class="photo-preview" id="photo-img" style="display:flex;align-items:center;justify-content:center;color:var(--text-muted)">Нет фото</div>`}
            <input type="file" id="part-photo-input" accept="image/*" style="display:none;">
            <button type="button" class="btn btn-secondary" id="btn-upload-part-photo" style="margin-top:10px;">Выбрать фото / Сделать снимок</button>
          </div>
          <div class="form-group">
            <label>Название детали *</label>
            <input type="text" id="part-name" value="${part.name}" placeholder="Вал 80-300 (Токарная)">
          </div>
          <div class="form-group">
            <label>Заметка</label>
            <textarea id="part-note" rows="3">${part.note || ''}</textarea>
          </div>

          <h3 style="margin-top:20px;">Привязанная оснастка</h3>
          <div id="tooling-selects"></div>

          <h3 style="margin-top:20px;">Станки, где делали</h3>
          <div class="tags-container" id="part-machines">
            ${state.machines.sort((a,b)=>a.order-b.order).map(m => `
              <label class="tag ${part.machineIds?.includes(m.id) ? 'active' : ''}">
                <input type="checkbox" class="tag-checkbox" value="${m.id}" ${part.machineIds?.includes(m.id) ? 'checked' : ''}>
                ${m.number}. ${m.model}
              </label>
            `).join('')}
          </div>

          <div class="modal-actions" style="margin-top:30px;">
            <button type="button" class="btn btn-secondary" onclick="location.hash='${isNew ? '#/data' : '#/part/'+id}'">Отмена</button>
            <button type="button" class="btn btn-primary" id="btn-save-part">Сохранить</button>
          </div>
        </div>
      `;
    },
    afterRender: (id, action) => {
      const isNew = id === 'new';
      const isEdit = action === 'edit' || isNew;
      const part = isNew ? { toolingIds: [], machineIds: [] } : state.parts.find(p => p.id === id);

      if (!isEdit) {
        // Кнопка удаления
        document.getElementById('btn-delete-part').onclick = async () => {
          if (confirm('Вы уверены, что хотите удалить эту деталь?')) {
            await deleteItem('parts', id);
            showToast('Деталь удалена');
            location.hash = '#/data';
          }
        };

        // КНОПКА "ДОБАВИТЬ В ЗАДАНИЕ" ИЗ КАРТОЧКИ ДЕТАЛИ
        document.getElementById('btn-add-task-from-part').onclick = () => {
          const allowedMachines = state.machines.filter(m => part.machineIds?.includes(m.id)).sort((a,b)=>a.order-b.order);
          
          if (allowedMachines.length === 0) {
            showToast('У детали не указаны станки. Отредактируйте карточку.');
            return;
          }

          const mOpts = allowedMachines.map(m => `<option value="${m.id}">${m.number}. ${m.model}</option>`).join('');

          openModal('Добавить в задание', `
            <div style="margin-bottom:15px; font-size:15px;">
              Деталь: <strong>${part.name}</strong>
            </div>
            <div class="form-group">
              <label>Станок</label>
              <select name="machineId">${mOpts}</select>
            </div>
            <div class="form-group">
              <label>Номер заказа (NN.NN)</label>
              <input type="text" name="orderNo" placeholder="69.27">
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
          `, 'Добавить', async (overlay) => {
            const form = overlay.querySelector('form');
            const { value: orderNo, warning } = normalizeOrderNo(form.orderNo.value);
            if (warning) showToast(`Внимание: ${warning}`);
            
            const machineId = form.machineId.value;
            const total = parseInt(form.total.value, 10);
            const isUrgent = form.isUrgent.checked;

            if (!orderNo) { showToast('Введите номер заказа'); return false; }
            if (isNaN(total) || total < 1) { showToast('Количество должно быть больше 0'); return false; }

            // Получаем текущие задачи для выбранного станка, чтобы определить позицию
            const currentMachineTasks = await getTasksByMachine(machineId);
            const isDuplicate = currentMachineTasks.some(t => t.orderNo === orderNo && t.partName.toLowerCase() === part.name.toLowerCase());
            
            if (isDuplicate) {
              if (!confirm(`Задача "${part.name}" по заказу ${orderNo} уже есть на этом станке. Всё равно добавить?`)) return false;
            }

            const newTask = { 
              id: 'task_' + Date.now(), machineId: machineId, pos: currentMachineTasks.length + 1, 
              orderNo, partName: part.name, total, done: 0, isUrgent, note: '',
              partId: part.id, // Автоматически привязываем ID
              createdAt: new Date().toISOString() 
            };
            await put('tasks', newTask);
            showToast(`Задача добавлена на станок`);
            location.hash = '#/data'; // Или можно перейти на станок
            return true;
          });
        };
        return;
      }

      // Логика редактирования (сокращена, идентична v28)
      let newPhotoBase64 = null;
      let currentToolingIds = part.toolingIds ? [...part.toolingIds] : [];

      document.getElementById('btn-upload-part-photo').onclick = () => {
        document.getElementById('part-photo-input').click();
      };
      document.getElementById('part-photo-input').onchange = async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        try {
          showToast('Обработка фото...');
          newPhotoBase64 = await compressImage(file);
          const imgEl = document.getElementById('photo-img');
          if (imgEl.tagName === 'IMG') { imgEl.src = newPhotoBase64; } 
          else {
            const newImg = document.createElement('img');
            newImg.src = newPhotoBase64; newImg.className = 'photo-preview'; newImg.id = 'photo-img';
            imgEl.replaceWith(newImg);
          }
        } catch (err) { showToast('Ошибка загрузки фото'); }
      };

      document.querySelectorAll('#part-machines .tag-checkbox').forEach(cb => {
        cb.onchange = () => { cb.parentElement.classList.toggle('active', cb.checked); };
      });

      const renderToolingSelects = () => {
        const container = document.getElementById('tooling-selects');
        let html = '';
        currentToolingIds.forEach((tid, index) => {
          const opts = state.toolings.map(t => `<option value="${t.id}" ${t.id === tid ? 'selected' : ''}>${t.code}</option>`).join('');
          html += `<div style="display:flex; gap:8px; margin-bottom:8px;">
              <select class="tooling-select" data-index="${index}" style="flex:1; padding:12px; border-radius:8px; background:var(--bg); color:var(--text); border:1px solid var(--border); font-size:16px;">${opts}</select>
              <button type="button" class="btn btn-secondary btn-remove-tooling" data-index="${index}" style="flex:0; padding:0 15px; color:var(--danger); font-size:20px;">✕</button>
            </div>`;
        });
        const allOpts = state.toolings.map(t => `<option value="${t.id}">${t.code}</option>`).join('');
        html += `<div style="display:flex; gap:8px; margin-bottom:8px;">
            <select id="add-tooling-select" style="flex:1; padding:12px; border-radius:8px; background:var(--bg); color:var(--text); border:1px solid var(--border); font-size:16px;">
              <option value="">+ Добавить оснастку...</option>${allOpts}
            </select></div>`;
        container.innerHTML = html;

        container.querySelectorAll('.tooling-select').forEach(sel => {
          sel.onchange = (e) => { currentToolingIds[parseInt(sel.dataset.index)] = e.target.value; };
        });
        container.querySelectorAll('.btn-remove-tooling').forEach(btn => {
          btn.onclick = () => { currentToolingIds.splice(parseInt(btn.dataset.index), 1); renderToolingSelects(); };
        });
        const addSel = document.getElementById('add-tooling-select');
        if (addSel) addSel.onchange = (e) => { if (e.target.value) { currentToolingIds.push(e.target.value); renderToolingSelects(); } };
      };
      renderToolingSelects();

      document.getElementById('btn-save-part').onclick = async () => {
        const name = document.getElementById('part-name').value.trim();
        if (!name) { showToast('Введите название детали'); return; }
        const machineIds = Array.from(document.querySelectorAll('#part-machines .tag-checkbox:checked')).map(cb => cb.value);
        const note = document.getElementById('part-note').value.trim();
        let finalPhoto = isNew ? '' : (state.parts.find(p => p.id === id)?.photo || '');
        if (newPhotoBase64 !== null) finalPhoto = newPhotoBase64;
        const partId = isNew ? 'part_' + Date.now() : id;
        await put('parts', { id: partId, name, note, toolingIds: currentToolingIds, machineIds, photo: finalPhoto });
        showToast('Деталь сохранена');
        location.hash = '#/data';
      };
    }
  },
  tooling: {
    title: 'Оснастка',
    render: (id, action) => {
      const isNew = id === 'new';
      const isEdit = action === 'edit' || isNew;
      const tool = isNew ? { code: '', name: '', note: '', photo: '' } : state.toolings.find(t => t.id === id);
      if (!tool) return '<div class="placeholder">Оснастка не найдена</div>';

      if (!isEdit) {
        return `
          <div class="card" style="margin-top:0;">
            ${tool.photo ? `<img src="${tool.photo}" class="photo-preview">` : '<div class="photo-preview" style="display:flex;align-items:center;justify-content:center;color:var(--text-muted)">Нет фото</div>'}
            <h2 style="margin-bottom:16px;">${tool.code}</h2>
            <div class="form-group">
              <label>Название</label>
              <div style="padding:12px; background:var(--bg); border-radius:8px;">${tool.name || '<span style="color:var(--text-muted)">Нет</span>'}</div>
            </div>
            <div class="form-group">
              <label>Заметка</label>
              <div style="padding:12px; background:var(--bg); border-radius:8px; min-height:44px;">${tool.note || '<span style="color:var(--text-muted)">Нет</span>'}</div>
            </div>
            <div class="modal-actions" style="margin-top:20px;">
              <button type="button" class="btn btn-primary" onclick="location.hash='#/tooling/${tool.id}/edit'">✏️ Редактировать</button>
              <button type="button" class="btn" id="btn-delete-tool" style="background:var(--danger); color:#fff;">Удалить</button>
            </div>
          </div>
        `;
      }

      return `
        <div class="card" style="margin-top:0;">
          <div class="form-group">
            <label>Фото</label>
            ${tool.photo ? `<img src="${tool.photo}" class="photo-preview" id="photo-img">` : `<div class="photo-preview" id="photo-img" style="display:flex;align-items:center;justify-content:center;color:var(--text-muted)">Нет фото</div>`}
            <input type="file" id="tool-photo-input" accept="image/*" style="display:none;">
            <button type="button" class="btn btn-secondary" id="btn-upload-photo" style="margin-top:10px;">Выбрать фото / Сделать снимок</button>
          </div>
          <div class="form-group">
            <label>Шифр оснастки *</label>
            <input type="text" id="tool-code" value="${tool.code}" placeholder="П-450">
          </div>
          <div class="form-group">
            <label>Название</label>
            <input type="text" id="tool-name" value="${tool.name}" placeholder="Оправка токарная">
          </div>
          <div class="form-group">
            <label>Заметка</label>
            <textarea id="tool-note" rows="3">${tool.note || ''}</textarea>
          </div>

          <div class="modal-actions" style="margin-top:30px;">
            <button type="button" class="btn btn-secondary" onclick="location.hash='${isNew ? '#/data' : '#/tooling/'+id}'">Отмена</button>
            <button type="button" class="btn btn-primary" id="btn-save-tool">Сохранить</button>
          </div>
        </div>
      `;
    },
    afterRender: (id, action) => {
      const isNew = id === 'new';
      const isEdit = action === 'edit' || isNew;

      if (!isEdit) {
        document.getElementById('btn-delete-tool').onclick = async () => {
          if (confirm('Вы уверены, что хотите удалить эту оснастку?')) {
            await deleteItem('toolings', id);
            showToast('Оснастка удалена');
            location.hash = '#/data';
          }
        };
        return;
      }

      let newPhotoBase64 = null;

      document.getElementById('btn-upload-photo').onclick = () => {
        document.getElementById('tool-photo-input').click();
      };

      document.getElementById('tool-photo-input').onchange = async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        try {
          showToast('Обработка фото...');
          newPhotoBase64 = await compressImage(file);
          const imgEl = document.getElementById('photo-img');
          if (imgEl.tagName === 'IMG') { imgEl.src = newPhotoBase64; } 
          else {
            const newImg = document.createElement('img');
            newImg.src = newPhotoBase64; newImg.className = 'photo-preview'; newImg.id = 'photo-img';
            imgEl.replaceWith(newImg);
          }
        } catch (err) { showToast('Ошибка загрузки фото'); }
      };

      document.getElementById('btn-save-tool').onclick = async () => {
        const code = document.getElementById('tool-code').value.trim();
        if (!code) { showToast('Введите шифр оснастки'); return; }
        const name = document.getElementById('tool-name').value.trim();
        const note = document.getElementById('tool-note').value.trim();
        let finalPhoto = isNew ? '' : (state.toolings.find(t => t.id === id)?.photo || '');
        if (newPhotoBase64 !== null) finalPhoto = newPhotoBase64;
        const toolId = isNew ? 'tool_' + Date.now() : id;
        await put('toolings', { id: toolId, code, name, note, photo: finalPhoto });
        showToast('Оснастка сохранена');
        location.hash = '#/data';
      };
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
        if (state.historyStartDate) filtered = filtered.filter(h => h.eventDate >= state.historyStartDate);
        if (state.historyEndDate) filtered = filtered.filter(h => h.eventDate <= state.historyEndDate);
        filtered.sort((a,b) => new Date(b.eventDate) - new Date(a.eventDate));
        if (filtered.length === 0) { list.innerHTML = '<div class="placeholder">История пуста</div>'; return; }
        list.innerHTML = filtered.map(h => {
          const isCancel = h.type === 'cancel';
          return `
            <div class="history-card">
              <div class="history-header"><span>${h.eventDate} · ${h.machineSnapshot}</span><span style="color:var(--accent); font-weight:600">Заказ ${h.orderNo}</span></div>
              <div class="history-part">${h.partName} ${h.isUrgent ? '🚨' : ''}</div>
              <div class="history-qty ${isCancel ? 'cancel' : ''}">${isCancel ? '✕ Отменено (остаток ' + h.qty + ')' : '✓ Сделано ' + h.qty + ' из ' + h.total}</div>
              ${h.note ? `<div style="font-size:13px; font-style:italic; color:var(--text-muted); margin-top:4px;">📝 ${h.note}</div>` : ''}
              <div class="history-actions"><button class="btn-small btn-return" data-id="${h.id}">${isCancel ? 'Возобновить' : 'Вернуть'}</button></div>
            </div>`;
        }).join('');
        document.querySelectorAll('.btn-return').forEach(btn => {
          btn.onclick = () => showToast('Функция возврата в разработке для v29');
        });
      };
      document.getElementById('hist-start').onchange = (e) => { state.historyStartDate = e.target.value; renderList(); };
      document.getElementById('hist-end').onchange = (e) => { state.historyEndDate = e.target.value; renderList(); };
      document.getElementById('btn-all-history').onclick = () => {
        state.historyStartDate = ''; state.historyEndDate = '';
        document.getElementById('hist-start').value = ''; document.getElementById('hist-end').value = '';
        renderList();
      };
      renderList();
    }
  },
  settings: {
    title: 'Настройки',
    render: () => {
      const cur = localStorage.getItem('theme') || 'auto';
      return `
        <div class="card">
          <h3>Тема</h3>
          <label><input type="radio" name="theme" value="auto" ${cur === 'auto' ? 'checked' : ''}> Системная</label>
          <label><input type="radio" name="theme" value="light" ${cur === 'light' ? 'checked' : ''}> Светлая</label>
          <label><input type="radio" name="theme" value="dark" ${cur === 'dark' ? 'checked' : ''}> Тёмная</label>
        </div>
        <div class="card">
          <h3>Данные</h3>
          <button class="btn-block" id="btn-export-excel">📊 Экспорт в Excel</button>
          <button class="btn-block" id="btn-backup">💾 Сохранить резервную копию</button>
          <button class="btn-block" id="btn-restore">📂 Загрузить копию</button>
          <input type="file" id="file-restore" accept=".json" style="display:none;">
        </div>
        <div class="placeholder" style="padding:20px 0;">Версия 2.5 · Связь справочников</div>
      `;
    },
    afterRender: () => {
      document.querySelectorAll('input[name="theme"]').forEach((r) => {
        r.addEventListener('change', () => { localStorage.setItem('theme', r.value); applyTheme(); });
      });

      // ОБНОВЛЕННЫЙ ЭКСПОРТ (Включает справочники)
      document.getElementById('btn-export-excel').onclick = () => {
        if (typeof XLSX === 'undefined') { showToast('Ошибка: библиотека Excel не загрузилась'); return; }
        const wb = XLSX.utils.book_new();
        const historyActive = state.history.filter(h => h.status === 'active');

        const wsDoneData = [['Дата', 'Станок', 'Заказ', 'Деталь', 'Сделано', 'Всего', 'Срочно', 'Заметка']];
        historyActive.filter(h => h.type === 'done').forEach(h => {
          wsDoneData.push([h.eventDate, h.machineSnapshot, h.orderNo, h.partName, h.qty, h.total, h.isUrgent ? 'Да' : '', h.note || '']);
        });
        XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(wsDoneData), 'Выполнено');

        const wsCancelData = [['Дата', 'Станок', 'Заказ', 'Деталь', 'Остаток', 'Заметка']];
        historyActive.filter(h => h.type === 'cancel').forEach(h => {
          wsCancelData.push([h.eventDate, h.machineSnapshot, h.orderNo, h.partName, h.qty, h.note || '']);
        });
        XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(wsCancelData), 'Отменено');

        // Выгрузка Деталей
        const wsParts = [['Название', 'Заметка', 'Оснастка (ID)', 'Станки (ID)']];
        state.parts.forEach(p => wsParts.push([p.name, p.note || '', (p.toolingIds||[]).join(', '), (p.machineIds||[]).join(', ')]));
        XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(wsParts), 'Справочник деталей');

        // Выгрузка Оснастки
        const wsTools = [['Шифр', 'Название', 'Заметка']];
        state.toolings.forEach(t => wsTools.push([t.code, t.name || '', t.note || '']));
        XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(wsTools), 'Справочник оснастки');

        XLSX.writeFile(wb, `Отчет_${formatDate(new Date())}.xlsx`);
      };

      // ОБНОВЛЕННЫЙ БЭКАП
      document.getElementById('btn-backup').onclick = async () => {
        const data = {
          version: 2, exportDate: new Date().toISOString(),
          machines: state.machines, tasks: state.allTasks, history: state.history,
          parts: state.parts, toolings: state.toolings // Добавили справочники
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
      
      // ОБНОВЛЕННЫЙ ИМПОРТ
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
            const tx = db.transaction(['machines', 'tasks', 'history', 'parts', 'toolings'], 'readwrite');
            tx.objectStore('machines').clear();
            tx.objectStore('tasks').clear();
            tx.objectStore('history').clear();
            tx.objectStore('parts').clear();
            tx.objectStore('toolings').clear();
            
            data.machines.forEach(m => tx.objectStore('machines').put(m));
            data.tasks.forEach(t => tx.objectStore('tasks').put(t));
            data.history.forEach(h => tx.objectStore('history').put(h));
            if (data.parts) data.parts.forEach(p => tx.objectStore('parts').put(p));
            if (data.toolings) data.toolings.forEach(t => tx.objectStore('toolings').put(t));
            
            tx.oncomplete = async () => {
              showToast('Данные успешно восстановлены');
              render();
            };
          } catch (err) { alert('Ошибка чтения файла: ' + err.message); }
        };
        reader.readAsText(file);
      };
    }
  }
};

window.switchDataTab = (tab) => {
  state.dataSubTab = tab;
  render();
};

// ---- Роутинг ----
async function render() {
  const hash = location.hash || '#/overview';
  const m = hash.match(/^#\/(\w+)(?:\/([^\/]+))?(?:\/(edit))?/);
  const route = m ? m[1] : 'overview';
  const param = m ? m[2] : null;
  const action = m ? m[3] : null;

  state.machines = await getAll('machines');
  state.allTasks = await getAll('tasks');
  state.history = await getAll('history');
  state.parts = await getAll('parts');
  state.toolings = await getAll('toolings');

  const btnBack = document.getElementById('btn-back');
  if (route === 'machine' || route === 'part' || route === 'tooling') {
    btnBack.style.display = 'block';
    btnBack.onclick = () => {
      if (route === 'machine') history.replaceState(null, '', '#/machines');
      else {
        if (action === 'edit') history.replaceState(null, '', `#/${route}/${param}`);
        else history.replaceState(null, '', '#/data');
      }
      render();
    };
    document.getElementById('tabbar').style.display = 'none';
  } else {
    btnBack.style.display = 'none';
    document.getElementById('tabbar').style.display = 'flex';
  }

  if (route === 'machine' && param) {
    state.currentMachineTasks = await getTasksByMachine(param);
    const machine = state.machines.find(x => x.id === param);
    document.getElementById('app-title').textContent = machine ? `${machine.number}. ${machine.model}` : 'Станок';
  } 
  else if (route === 'part') { 
    document.getElementById('app-title').textContent = param === 'new' ? 'Новая деталь' : 'Деталь';
  }
  else if (route === 'tooling') { 
    document.getElementById('app-title').textContent = param === 'new' ? 'Новая оснастка' : 'Оснастка';
  }
  else {
    document.getElementById('app-title').textContent = screens[route]?.title || 'Учет';
  }

  const screen = screens[route] || screens.overview;
  document.getElementById('app-main').innerHTML = screen.render(param, action);
  
  document.querySelectorAll('#tabbar a').forEach((a) => {
    a.classList.toggle('active', a.dataset.tab === route || ((route === 'machine') && a.dataset.tab === 'machines') || ((route === 'part' || route === 'tooling') && a.dataset.tab === 'data'));
  });

  if (typeof screen.afterRender === 'function') screen.afterRender(param, action);
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
    const today = formatDate(new Date());
    state.historyStartDate = today;
    state.historyEndDate = today;

    if (!location.hash) history.replaceState(null, '', '#/overview');
    await render();
  } catch (err) {
    document.getElementById('app-main').innerHTML = `<div class="placeholder" style="color:red">Ошибка: ${err.message}</div>`;
  }
}

init();

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(console.warn));
}
