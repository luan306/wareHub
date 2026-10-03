import { useEffect, useState, useCallback } from 'react';
import { api } from '../api/client';
import { useT } from '../i18n';
import { useReconnect } from '../context/ConnectionContext';
import { useAuth } from '../context/AuthContext';

const emptyForm = { id: null, username: '', password: '', full_name: '', role: 'staff', auth_source: 'local' };

const roleLabelKey = { staff: 'role.staff', admin: 'role.adminShort', superadmin: 'role.superadmin' };

export function Users() {
  const { t } = useT();
  const { isSuperAdmin } = useAuth();
  const [users, setUsers] = useState([]);
  const [error, setError] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [formError, setFormError] = useState('');

  const [ldapModalOpen, setLdapModalOpen] = useState(false);
  const [ldapQuery, setLdapQuery] = useState('');
  const [ldapResults, setLdapResults] = useState(null);
  const [ldapTruncated, setLdapTruncated] = useState(false); // AD còn nhiều hơn số đã lấy về, chưa liệt kê hết
  const [ldapSearching, setLdapSearching] = useState(false);
  const [ldapError, setLdapError] = useState('');
  const [ldapSelected, setLdapSelected] = useState(new Set()); // username đã tick chọn để thêm hàng loạt
  const [ldapBulkRole, setLdapBulkRole] = useState('staff');
  const [ldapAdding, setLdapAdding] = useState(false);

  const fetchUsers = useCallback(async () => {
    try {
      const data = await api.get('/users');
      setUsers(data.users);
    } catch (err) {
      setError(err.message);
    }
  }, []);

  useEffect(() => { fetchUsers(); }, [fetchUsers]);
  useReconnect(fetchUsers);

  function openCreateModal() {
    setForm(emptyForm);
    setFormError('');
    setModalOpen(true);
  }

  function openEditModal(u) {
    setForm({ id: u.id, username: u.username, password: '', full_name: u.full_name, role: u.role, auth_source: u.auth_source });
    setFormError('');
    setModalOpen(true);
  }

  async function runLdapSearch(query) {
    setLdapError(''); setLdapSearching(true); setLdapResults(null);
    try {
      const data = await api.get('/users/ldap-search', { q: query });
      setLdapResults(data.results);
      setLdapTruncated(!!data.truncated);
      // Lọc lại theo đúng tập kết quả mới (tránh giữ tick của những dòng không còn trong danh sách sau khi tìm lại).
      const names = new Set(data.results.map((r) => r.username));
      setLdapSelected((prev) => new Set([...prev].filter((u) => names.has(u))));
    } catch (err) {
      setLdapError(err.message);
    } finally {
      setLdapSearching(false);
    }
  }

  function openLdapModal() {
    setLdapQuery(''); setLdapResults(null); setLdapError(''); setLdapSelected(new Set()); setLdapBulkRole('staff');
    setLdapModalOpen(true);
    // Mở khung là thấy ngay danh sách gợi ý (không bắt gõ tìm trước) — gõ tìm sau đó chỉ để lọc bớt lại.
    runLdapSearch('');
  }

  function handleLdapSearch(e) {
    e.preventDefault();
    runLdapSearch(ldapQuery.trim());
  }

  function toggleLdapSelect(username) {
    setLdapSelected((prev) => {
      const next = new Set(prev);
      if (next.has(username)) next.delete(username); else next.add(username);
      return next;
    });
  }

  function toggleLdapSelectAll() {
    const all = (ldapResults || []).every((r) => ldapSelected.has(r.username));
    setLdapSelected(all ? new Set() : new Set((ldapResults || []).map((r) => r.username)));
  }

  async function handleLdapBulkAdd() {
    if (ldapSelected.size === 0) return;
    setLdapError(''); setLdapAdding(true);
    const chosen = (ldapResults || []).filter((r) => ldapSelected.has(r.username));
    // Mỗi tài khoản thêm độc lập, không có thứ tự/số đếm nào cần giữ liền mạch (khác hẳn số phiếu bàn giao) — chạy
    // song song cho nhanh thay vì đợi từng cái một, 1 người lỗi không chặn những người còn lại.
    const outcomes = await Promise.allSettled(
      chosen.map((r) => api.post('/users/ldap-add', { username: r.username, full_name: r.full_name, role: ldapBulkRole })),
    );
    const failed = outcomes.filter((o) => o.status === 'rejected').length;
    setLdapAdding(false);
    fetchUsers();
    if (failed > 0) {
      setLdapError(t('users.ldapBulkPartialFail', { failed, total: chosen.length }));
      runLdapSearch(ldapQuery.trim()); // làm mới danh sách: ai thêm thành công thì biến mất, ai lỗi vẫn còn để thử lại
    } else {
      setLdapModalOpen(false);
    }
  }

  async function handleSave(e) {
    e.preventDefault();
    setFormError('');
    try {
      if (form.id) {
        const payload = { full_name: form.full_name, role: form.role };
        if (form.password) payload.password = form.password;
        await api.put(`/users/${form.id}`, payload);
      } else {
        await api.post('/users', form);
      }
      setModalOpen(false);
      fetchUsers();
    } catch (err) {
      setFormError(err.message);
    }
  }

  async function handleToggleActive(u) {
    try {
      await api.put(`/users/${u.id}`, { is_active: !u.is_active });
      fetchUsers();
    } catch (err) {
      alert(err.message);
    }
  }

  async function handleDelete(u) {
    if (!confirm(t('users.confirmDelete', { name: u.full_name, username: u.username }))) return;
    try {
      await api.del(`/users/${u.id}`);
      fetchUsers();
    } catch (err) {
      alert(err.message);
    }
  }

  return (
    <div>
      <div className="page-head">
        <h2>{t('users.title')}</h2>
        <div className="row-actions">
          <button onClick={openLdapModal}>{t('users.addLdap')}</button>
          <button className="btn-primary" onClick={openCreateModal}>{t('users.add')}</button>
        </div>
      </div>

      {error && <div className="error-box">{error}</div>}

      <div className="table-scroll">
      <table className="data-table">
        <thead>
          <tr>
            <th>{t('users.username')}</th>
            <th>{t('users.fullName')}</th>
            <th>{t('users.role')}</th>
            <th>{t('users.status')}</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {users.map((u) => (
            <tr key={u.id}>
              <td className="mono" data-label={t('users.username')}>
                {u.username}
                {u.auth_source === 'ldap' && <span style={{ marginLeft: 6, fontSize: 11, color: 'var(--muted)', fontWeight: 600 }}>LDAP</span>}
              </td>
              <td data-label={t('users.fullName')}>{u.full_name}</td>
              <td data-label={t('users.role')}>{t(roleLabelKey[u.role] ?? 'role.staff')}</td>
              <td data-label={t('users.status')}>{u.is_active ? t('users.active') : t('users.locked')}</td>
              <td className="row-actions">
                <button onClick={() => openEditModal(u)}>{t('common.edit')}</button>
                <button onClick={() => handleToggleActive(u)}>
                  {u.is_active ? t('users.lock') : t('users.unlock')}
                </button>
                <button onClick={() => handleDelete(u)}>{t('common.delete')}</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      </div>

      {modalOpen && (
        <div className="modal-backdrop" onClick={() => setModalOpen(false)}>
          <form className="modal-card" onClick={(e) => e.stopPropagation()} onSubmit={handleSave}>
            <h3>{form.id ? t('users.editTitle') : t('users.addTitle')}</h3>

            <label>{t('users.username')}</label>
            <input
              value={form.username}
              onChange={(e) => setForm({ ...form, username: e.target.value })}
              disabled={!!form.id}
              required
            />

            <label>{t('users.fullName')}</label>
            <input
              value={form.full_name}
              onChange={(e) => setForm({ ...form, full_name: e.target.value })}
              required
            />

            <label>{t('users.role')}</label>
            <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
              <option value="staff">{t('role.staff')}</option>
              <option value="admin">{t('role.adminShort')}</option>
              {/* Chỉ superadmin được thấy/chọn mục này — khớp với giới hạn backend (admin thường chọn sẽ bị từ chối 403). */}
              {(isSuperAdmin || form.role === 'superadmin') && <option value="superadmin">{t('role.superadmin')}</option>}
            </select>

            {form.id && form.auth_source === 'ldap' ? (
              <small className="field-hint">{t('users.ldapPasswordNote')}</small>
            ) : (
              <>
                <label>{form.id ? t('users.newPassword') : t('users.password')}</label>
                <input
                  type="password"
                  value={form.password}
                  onChange={(e) => setForm({ ...form, password: e.target.value })}
                  required={!form.id}
                  minLength={form.id ? undefined : 10}
                  maxLength={128}
                  autoComplete="new-password"
                />
                <small className="field-hint">{t('users.passwordRules')}</small>
              </>
            )}

            {formError && <div className="error-box">{formError}</div>}

            <div className="modal-actions">
              <button type="button" onClick={() => setModalOpen(false)}>{t('common.cancel')}</button>
              <button type="submit" className="btn-primary">{t('common.save')}</button>
            </div>
          </form>
        </div>
      )}

      {ldapModalOpen && (
        <div className="modal-backdrop" onClick={() => setLdapModalOpen(false)}>
          <div className="modal-card ldap-modal" onClick={(e) => e.stopPropagation()}>
            <h3>{t('users.addLdap')}</h3>

            <form onSubmit={handleLdapSearch} className="ldap-search-bar">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="11" cy="11" r="7" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>
              <input
                value={ldapQuery}
                onChange={(e) => setLdapQuery(e.target.value)}
                placeholder={t('users.ldapSearchPlaceholder')}
                minLength={2}
                required
                autoFocus
              />
              <button type="submit" disabled={ldapSearching}>
                {ldapSearching ? t('common.loading') : t('users.ldapSearch')}
              </button>
            </form>

            {ldapError && <div className="error-box">{ldapError}</div>}

            {ldapResults && (
              ldapResults.length === 0 ? (
                <div className="empty-state">{t('users.ldapNoResults')}</div>
              ) : (
                <>
                  <div className="ldap-list-head">
                    <label className="ldap-select-all">
                      <input type="checkbox" checked={ldapResults.every((r) => ldapSelected.has(r.username))} onChange={toggleLdapSelectAll} />
                      {t('users.ldapSelectAll')}
                    </label>
                    <span className="ldap-hint">
                      {t('users.ldapSelectedCount', { selected: ldapSelected.size, total: ldapResults.length })}
                      {ldapTruncated ? ` · ${t('users.ldapTruncated')}` : ''}
                    </span>
                  </div>
                  <div className="ldap-results">
                    {ldapResults.map((r) => (
                      <label className="ldap-result-row" key={r.username}>
                        <input type="checkbox" checked={ldapSelected.has(r.username)} onChange={() => toggleLdapSelect(r.username)} />
                        <div className="ldap-result-avatar">{r.full_name.charAt(0).toUpperCase()}</div>
                        <div className="ldap-result-info">
                          <b>{r.full_name}</b>
                          <span className="mono">{r.username}{r.email ? ` · ${r.email}` : ''}</span>
                        </div>
                      </label>
                    ))}
                  </div>
                </>
              )
            )}

            <div className="ldap-bulk-footer">
              <label className="ldap-bulk-role">
                {t('users.role')}
                <select value={ldapBulkRole} onChange={(e) => setLdapBulkRole(e.target.value)}>
                  <option value="staff">{t('role.staff')}</option>
                  <option value="admin">{t('role.adminShort')}</option>
                  {isSuperAdmin && <option value="superadmin">{t('role.superadmin')}</option>}
                </select>
              </label>
              <div className="modal-actions">
                <button type="button" onClick={() => setLdapModalOpen(false)}>{t('common.cancel')}</button>
                <button type="button" className="btn-primary" disabled={ldapAdding || ldapSelected.size === 0} onClick={handleLdapBulkAdd}>
                  {ldapAdding ? t('common.loading') : t('users.ldapAddSelected', { count: ldapSelected.size })}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
