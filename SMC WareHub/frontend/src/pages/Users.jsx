import { useEffect, useState, useCallback } from 'react';
import { api } from '../api/client';

const emptyForm = { id: null, username: '', password: '', full_name: '', role: 'staff' };

export function Users() {
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
    if (!confirm(`Xoá người dùng "${u.full_name}" (${u.username})?`)) return;
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
        <h2>Quản lý người dùng</h2>
        <button className="btn-primary" onClick={openCreateModal}>+ Thêm người dùng</button>
      </div>

      {error && <div className="error-box">{error}</div>}

      <table className="data-table">
        <thead>
          <tr>
            <th>Tên đăng nhập</th>
            <th>Họ tên</th>
            <th>Vai trò</th>
            <th>Trạng thái</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {users.map((u) => (
            <tr key={u.id}>
              <td className="mono">{u.username}</td>
              <td>{u.full_name}</td>
              <td>{u.role === 'admin' ? 'Quản trị' : 'Nhân viên'}</td>
              <td>{u.is_active ? 'Đang hoạt động' : 'Đã khoá'}</td>
              <td className="row-actions">
                <button onClick={() => openEditModal(u)}>Sửa</button>
                <button onClick={() => handleToggleActive(u)}>
                  {u.is_active ? 'Khoá' : 'Mở khoá'}
                </button>
                <button onClick={() => handleDelete(u)}>Xoá</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {modalOpen && (
        <div className="modal-backdrop" onClick={() => setModalOpen(false)}>
          <form className="modal-card" onClick={(e) => e.stopPropagation()} onSubmit={handleSave}>
            <h3>{form.id ? 'Sửa người dùng' : 'Thêm người dùng'}</h3>

            <label>Tên đăng nhập</label>
            <input
              value={form.username}
              onChange={(e) => setForm({ ...form, username: e.target.value })}
              disabled={!!form.id}
              required
            />

            <label>Họ tên</label>
            <input
              value={form.full_name}
              onChange={(e) => setForm({ ...form, full_name: e.target.value })}
              required
            />

            <label>Vai trò</label>
            <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
              <option value="staff">Nhân viên</option>
              <option value="admin">Quản trị</option>
            </select>

            <label>{form.id ? 'Mật khẩu mới (để trống nếu không đổi)' : 'Mật khẩu'}</label>
            <input
              type="password"
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              required={!form.id}
            />

            {formError && <div className="error-box">{formError}</div>}

            <div className="modal-actions">
              <button type="button" onClick={() => setModalOpen(false)}>Huỷ</button>
              <button type="submit" className="btn-primary">Lưu</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
