import { useEffect, useState, useCallback } from 'react';
import { api } from '../api/client';
import { useT } from '../i18n';
import { useReconnect } from '../context/ConnectionContext';
import { useAuth } from '../context/AuthContext';

const emptyForm = { id: null, username: '', password: '', full_name: '', role: 'staff', auth_source: 'local' };
const emptyLdapAdd = { username: '', full_name: '', role: 'staff' };

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
  const [ldapSearching, setLdapSearching] = useState(false);
  const [ldapError, setLdapError] = useState('');
  const [ldapPicked, setLdapPicked] = useState(null); // { username, full_name, email } vừa chọn, đang chờ xác nhận vai trò
  const [ldapAddForm, setLdapAddForm] = useState(emptyLdapAdd);
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

  function openLdapModal() {
    setLdapQuery(''); setLdapResults(null); setLdapError(''); setLdapPicked(null); setLdapAddForm(emptyLdapAdd);
    setLdapModalOpen(true);
  }

  async function handleLdapSearch(e) {
    e.preventDefault();
    setLdapError(''); setLdapSearching(true); setLdapResults(null);
    try {
      const data = await api.get('/users/ldap-search', { q: ldapQuery.trim() });
      setLdapResults(data.results);
    } catch (err) {
      setLdapError(err.message);
    } finally {
      setLdapSearching(false);
    }
  }

  function pickLdapResult(r) {
    setLdapPicked(r);
    setLdapAddForm({ username: r.username, full_name: r.full_name, role: 'staff' });
  }

  async function handleLdapAdd(e) {
    e.preventDefault();
    setLdapError(''); setLdapAdding(true);
    try {
      await api.post('/users/ldap-add', ldapAddForm);
      setLdapModalOpen(false);
      fetchUsers();
    } catch (err) {
      setLdapError(err.message);
    } finally {
      setLdapAdding(false);
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
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <h3>{t('users.addLdap')}</h3>

            {!ldapPicked ? (
              <>
                <form onSubmit={handleLdapSearch} className="row-actions" style={{ marginBottom: 12 }}>
                  <input
                    value={ldapQuery}
                    onChange={(e) => setLdapQuery(e.target.value)}
                    placeholder={t('users.ldapSearchPlaceholder')}
                    minLength={2}
                    required
                    autoFocus
                    style={{ flex: 1 }}
                  />
                  <button type="submit" className="btn-primary" disabled={ldapSearching}>
                    {ldapSearching ? t('common.loading') : t('users.ldapSearch')}
                  </button>
                </form>

                {ldapError && <div className="error-box">{ldapError}</div>}

                {ldapResults && (
                  ldapResults.length === 0 ? (
                    <div className="empty-state">{t('users.ldapNoResults')}</div>
                  ) : (
                    <div className="table-scroll">
                      <table className="data-table">
                        <thead>
                          <tr>
                            <th>{t('users.username')}</th>
                            <th>{t('users.fullName')}</th>
                            <th></th>
                          </tr>
                        </thead>
                        <tbody>
                          {ldapResults.map((r) => (
                            <tr key={r.username}>
                              <td className="mono">{r.username}</td>
                              <td>{r.full_name}</td>
                              <td><button type="button" className="btn-primary" onClick={() => pickLdapResult(r)}>{t('users.ldapPick')}</button></td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )
                )}

                <div className="modal-actions">
                  <button type="button" onClick={() => setLdapModalOpen(false)}>{t('common.cancel')}</button>
                </div>
              </>
            ) : (
              <form onSubmit={handleLdapAdd}>
                <p><strong>{ldapPicked.full_name}</strong> <span className="mono">({ldapPicked.username})</span></p>

                <label>{t('users.role')}</label>
                <select value={ldapAddForm.role} onChange={(e) => setLdapAddForm({ ...ldapAddForm, role: e.target.value })}>
                  <option value="staff">{t('role.staff')}</option>
                  <option value="admin">{t('role.adminShort')}</option>
                  {isSuperAdmin && <option value="superadmin">{t('role.superadmin')}</option>}
                </select>

                {ldapError && <div className="error-box">{ldapError}</div>}

                <div className="modal-actions">
                  <button type="button" onClick={() => setLdapPicked(null)}>{t('common.back')}</button>
                  <button type="submit" className="btn-primary" disabled={ldapAdding}>
                    {ldapAdding ? t('common.loading') : t('common.save')}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
