import { useEffect, useState, useCallback } from 'react';
import { api } from '../api/client';
import { useT } from '../i18n';
import { useReconnect } from '../context/ConnectionContext';

const emptyForm = { id: null, username: '', password: '', full_name: '', role: 'staff' };

export function Users() {
  const { t } = useT();
  const [users, setUsers] = useState([]);
  const [error, setError] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [formError, setFormError] = useState('');

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
    setForm({ id: u.id, username: u.username, password: '', full_name: u.full_name, role: u.role });
    setFormError('');
    setModalOpen(true);
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
        <button className="btn-primary" onClick={openCreateModal}>{t('users.add')}</button>
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
              <td className="mono" data-label={t('users.username')}>{u.username}</td>
              <td data-label={t('users.fullName')}>{u.full_name}</td>
              <td data-label={t('users.role')}>{u.role === 'admin' ? t('role.adminShort') : t('role.staff')}</td>
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
            </select>

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

            {formError && <div className="error-box">{formError}</div>}

            <div className="modal-actions">
              <button type="button" onClick={() => setModalOpen(false)}>{t('common.cancel')}</button>
              <button type="submit" className="btn-primary">{t('common.save')}</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
