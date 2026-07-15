import { authProvider } from '../../auth/provider.js';
import { escapeHTML } from '../../core/utils.js';
import { confirmModal } from '../../ui/modal.js';
import { toast } from '../../ui/toast.js';

const CSS = `
.mx-admin { padding:20px; overflow-y:auto; height:100%; background:var(--surface); }
.mx-admin .ah { margin-bottom:16px; }
.mx-admin .ah h2 { font-size:18px; font-weight:800; color:var(--text-strong); }
.mx-admin .ah p { font-size:12px; color:var(--muted); margin-top:2px; }
.mx-admin h3 { font-size:11px; text-transform:uppercase; letter-spacing:.08em; color:var(--muted); margin-bottom:10px; }
.kpis { display:grid; grid-template-columns:repeat(auto-fill,minmax(180px,1fr)); gap:12px; margin-bottom:24px; }
.kpi-card { background:var(--surface-2); border:1px solid var(--border-soft); border-radius:var(--r-lg); padding:16px; }
.kpi-card .kpi-ico { font-size:24px; margin-bottom:6px; }
.kpi-card .kpi-val { font-size:28px; font-weight:800; color:var(--text-strong); }
.kpi-card .kpi-lab { font-size:11px; color:var(--muted); text-transform:uppercase; letter-spacing:.05em; }
.charts { display:grid; grid-template-columns:1fr 1fr; gap:16px; margin-bottom:24px; }
.chart-block { background:var(--surface-2); border:1px solid var(--border-soft); border-radius:var(--r-lg); padding:16px; }
.chart-svg { width:100%; height:auto; }
.empty { font-size:12px; color:var(--muted); padding:12px 0; }
.mx-admin .users { background:var(--surface-2); border:1px solid var(--border-soft); border-radius:var(--r-lg); padding:16px; }
.mx-admin table { width:100%; border-collapse:collapse; font-size:12px; }
.mx-admin th { text-align:left; padding:8px 10px; color:var(--muted); font-weight:700; text-transform:uppercase; font-size:10px; letter-spacing:.05em; border-bottom:1px solid var(--border); }
.mx-admin td { padding:8px 10px; border-bottom:1px solid var(--border-soft); }
.mx-admin .badge { display:inline-block; padding:2px 8px; border-radius:99px; font-size:10px; font-weight:700; }
.mx-admin .badge-ativo { background:#16a34a22; color:#16a34a; }
.mx-admin .badge-bloqueado { background:#dc262622; color:#dc2626; }
.mx-admin .badge-pendente { background:#f59e0b22; color:#f59e0b; }
.mx-admin .badge-admin { background:#6366f122; color:#6366f1; }
.mx-admin .badge-user { background:#64748b22; color:#64748b; }
.mx-admin .actions { display:flex; gap:4px; }
.mx-admin .actions button { padding:4px 8px; border-radius:var(--r-sm); font-size:10px; font-weight:700; cursor:pointer; }
.mx-admin .btn-sm { background:var(--surface); border:1px solid var(--border); color:var(--text); }
.mx-admin .btn-sm-danger { background:var(--surface); border:1px solid var(--danger); color:var(--danger); }
.mx-admin .btn-sm-approve { background:#16a34a; border:none; color:#fff; }
.mx-admin .btn-sm-deny { background:#dc2626; border:none; color:#fff; }
.mx-admin .pending-card { background:#f59e0b11; border:1px solid #f59e0b44; border-radius:var(--r-lg); padding:12px 14px; margin-bottom:8px; display:flex; align-items:center; gap:12px; }
.mx-admin .pending-card .pc-info { flex:1; }
.mx-admin .pending-card .pc-info .t { font-size:13px; font-weight:700; color:var(--text); }
.mx-admin .pending-card .pc-info .d { font-size:11px; color:var(--muted); }
.mx-admin .pending-card .pc-actions { display:flex; gap:6px; }
@media (max-width:700px) { .charts { grid-template-columns:1fr; } }
`;

function injectStyle() {
  if (document.getElementById('mx-admin-style')) return;
  const s = document.createElement('style');
  s.id = 'mx-admin-style';
  s.textContent = CSS;
  document.head.appendChild(s);
}

function _kpiCard(ico, label, value) {
  return `<div class="kpi-card"><div class="kpi-ico">${ico}</div><div class="kpi-val">${value}</div><div class="kpi-lab">${label}</div></div>`;
}

function _fmtDuration(ms) {
  if (!ms) return '—';
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  return `${m}m ${s % 60}s`;
}

function _barChart(data, xKey, yKey) {
  if (!data.length) return '<p class="empty">Sem dados.</p>';
  const max = Math.max(...data.map((d) => d[yKey]), 1);
  const W = 320, H = 120, pad = 20, bw = (W - pad * 2) / data.length;
  const bars = data.map((d, i) => {
    const h = (d[yKey] / max) * (H - pad * 2);
    const x = pad + i * bw;
    const y = H - pad - h;
    return `<rect x="${x + 2}" y="${y}" width="${bw - 4}" height="${h}" rx="2" fill="var(--accent)"/>
            <text x="${x + bw / 2}" y="${H - pad + 12}" font-size="9" fill="var(--muted)" text-anchor="middle">${d[xKey].slice(5)}</text>`;
  }).join('');
  return `<svg viewBox="0 0 ${W} ${H}" class="chart-svg">${bars}</svg>`;
}

function _hbarChart(data, xKey, yKey) {
  if (!data.length) return '<p class="empty">Sem dados.</p>';
  const max = Math.max(...data.map((d) => d[yKey]), 1);
  const W = 320, H = 30 * data.length + 10, pad = 80, barH = 20, gap = 8;
  const bars = data.map((d, i) => {
    const w = (d[yKey] / max) * (W - pad - 10);
    const y = i * (barH + gap);
    return `<text x="4" y="${y + barH - 4}" font-size="11" fill="var(--text)">${d[xKey]}</text>
            <rect x="${pad}" y="${y}" width="${Math.max(w, 2)}" height="${barH}" rx="3" fill="var(--accent)"/>
            <text x="${pad + w + 6}" y="${y + barH - 4}" font-size="11" fill="var(--muted)">${d[yKey]}</text>`;
  }).join('');
  return `<svg viewBox="0 0 ${W} ${H}" class="chart-svg">${bars}</svg>`;
}

function _usersTable(users, currentUserId, { firebaseMode = false } = {}) {
  const rows = users.map((u) => {
    const isMe = u.id === currentUserId;
    const safeId = escapeHTML(u.id);
    const safeAvatar = escapeHTML(u.avatar);
    const safeName = escapeHTML(u.nome);
    const safeEmail = escapeHTML(u.email);
    const safeProfile = escapeHTML(u.perfil);
    const safeStatus = escapeHTML(u.status);
    const statusMap = { ativo: 'badge-ativo', bloqueado: 'badge-bloqueado', pendente: 'badge-pendente' };
    const statusBadge = statusMap[u.status] || 'badge-pendente';
    const perfilBadge = u.perfil === 'admin' ? 'badge-admin' : 'badge-user';
    const actBlock = u.status === 'ativo' ? 'Bloquear' : (u.status === 'bloqueado' ? 'Reativar' : '');
    return `<tr>
      <td>${safeAvatar} <strong>${safeName}</strong>${isMe ? ' (você)' : ''}</td>
      <td>${safeEmail}</td>
      <td><span class="badge ${perfilBadge}">${safeProfile}</span></td>
      <td><span class="badge ${statusBadge}">${safeStatus}</span></td>
      <td class="actions">
        ${!isMe && u.status !== 'pendente' ? `
          <button class="btn-sm" data-act="block" data-id="${safeId}">${actBlock}</button>
          ${firebaseMode ? '' : `
            <button class="btn-sm" data-act="promote" data-id="${safeId}">${u.perfil === 'admin' ? 'Rebaixar' : 'Promover'}</button>
            <button class="btn-sm-danger" data-act="delete" data-id="${safeId}">Remover</button>
          `}
        ` : ''}
        ${!isMe && u.status === 'pendente' ? `
          <button class="btn-sm-approve" data-act="approve" data-id="${safeId}">✓ Aprovar</button>
          <button class="btn-sm-deny" data-act="deny" data-id="${safeId}">✗ Recusar</button>
        ` : ''}
        ${isMe ? '<span style="color:var(--muted);font-size:10px;">—</span>' : ''}
      </td>
    </tr>`;
  }).join('');
  return `<table><thead><tr><th>Usuário</th><th>E-mail</th><th>Perfil</th><th>Status</th><th>Ações</th></tr></thead><tbody>${rows}</tbody></table>`;
}

export async function mount(host) {
  injectStyle();

  const user = authProvider.getCurrentUser();
  if (!user || !authProvider.isAdmin()) {
    host.innerHTML = `<div class="mx-admin"><div style="padding:24px;color:var(--danger);font-weight:700;">Acesso restrito a administradores.</div></div>`;
    return;
  }

  const [users, pendentes, topApps, logins, avgDur] = await Promise.all([
    authProvider.listUsers(),
    authProvider.pendingUsers(),
    authProvider.topApps({ limit: 6 }),
    authProvider.loginsByDay(7),
    authProvider.avgSessionDuration(),
  ]);

  const ativos = users.filter((u) => u.status === 'ativo').length;
  const bloqueados = users.filter((u) => u.status === 'bloqueado').length;
  const total = users.length;

  host.innerHTML = `
    <div class="mx-admin">
      <div class="ah">
        <h2>🛡️ Painel Administrativo</h2>
        <p>${authProvider.isFirebaseMode
          ? 'Whitelist Firebase; papeis administrativos sao geridos pelo script confiavel'
          : 'Estatísticas e gestão de usuários'}</p>
      </div>
      <section class="kpis">
        ${_kpiCard('👥', 'Total', total)}
        ${_kpiCard('🟢', 'Ativos', ativos)}
        ${pendentes.length ? _kpiCard('🟡', 'Pendentes', pendentes.length) : ''}
        ${_kpiCard('🔴', 'Bloqueados', bloqueados)}
        ${_kpiCard('⏱️', 'Sessão média', _fmtDuration(avgDur))}
      </section>
      ${pendentes.length ? `<section class="users" style="border-color:#f59e0b44;">
        <h3>⏳ Pendentes de aprovação</h3>
        ${pendentes.map((u) => `
          <div class="pending-card">
            <div class="pc-info">
              <div class="t">${escapeHTML(u.avatar)} ${escapeHTML(u.nome)}</div>
              <div class="d">${escapeHTML(u.email)}${u.username ? ` · ${escapeHTML(u.username)}` : ''}</div>
            </div>
            <div class="pc-actions">
              <button class="btn-sm-approve" data-act="approve" data-id="${escapeHTML(u.id)}">✓ Aprovar</button>
              <button class="btn-sm-deny" data-act="deny" data-id="${escapeHTML(u.id)}">✗ Recusar</button>
            </div>
          </div>`).join('')}
      </section>` : ''}
      <section class="charts">
        <div class="chart-block">
          <h3>Logins (7 dias)</h3>
          ${_barChart(logins, 'dia', 'count')}
        </div>
        <div class="chart-block">
          <h3>Apps mais usados</h3>
          ${_hbarChart(topApps, 'app', 'count')}
        </div>
      </section>
      <section class="users">
        <h3>Gestão de usuários</h3>
        ${_usersTable(users, authProvider.getCurrentUser().id, {
          firebaseMode: authProvider.isFirebaseMode,
        })}
      </section>
    </div>`;

  _wireTable(host);
  _wirePendingCards(host);
}

function _wirePendingCards(host) {
  host.addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-act="approve"],[data-act="deny"]');
    if (!btn || btn.closest('.users table')) return;
    const id = btn.dataset.id;
    const act = btn.dataset.act;
    const all = await authProvider.listUsers();
    const target = all.find((x) => x.id === id);
    if (!target) return;
    const safeTargetName = escapeHTML(target.nome);
    if (act === 'approve') {
      await authProvider.approveUser(id);
      toast.success(`${safeTargetName} aprovado!`);
    }
    if (act === 'deny') {
      await authProvider.rejectUser(id);
      toast.success(authProvider.isFirebaseMode
        ? `${safeTargetName} recusado.`
        : `${safeTargetName} recusado e removido.`);
    }
    mount(host);
  });
}

function _wireTable(host) {
  host.querySelector('.users table')?.addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-act]');
    if (!btn) return;
    const id = btn.dataset.id;
    const act = btn.dataset.act;
    const all = await authProvider.listUsers();
    const target = all.find((x) => x.id === id);
    if (!target) return;
    const safeTargetName = escapeHTML(target.nome);

    if (act === 'block') {
      const novo = target.status === 'ativo' ? 'bloqueado' : 'ativo';
      await authProvider.setStatus(id, novo);
      toast.success(`${safeTargetName} ${novo === 'ativo' ? 'reativado' : 'bloqueado'}.`);
    }
    if (act === 'promote') {
      const novo = target.perfil === 'admin' ? 'user' : 'admin';
      await authProvider.setPerfil(id, novo);
      toast.success(`${safeTargetName} agora é ${novo}.`);
    }
    if (act === 'approve') {
      await authProvider.approveUser(id);
      toast.success(`${safeTargetName} aprovado!`);
    }
    if (act === 'deny') {
      await authProvider.rejectUser(id);
      toast.success(authProvider.isFirebaseMode
        ? `${safeTargetName} recusado.`
        : `${safeTargetName} recusado e removido.`);
    }
    if (act === 'delete') {
      const ok = await confirmModal({ title: 'Remover usuário', message: `Remover ${safeTargetName}?`, danger: true });
      if (ok) {
        await authProvider.deleteUser(id);
        toast.success(`${safeTargetName} removido.`);
      } else {
        return;
      }
    }
    mount(host);
  });
}
