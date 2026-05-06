import type { FC } from 'hono/jsx';
import { AdminLayout } from '../layouts/base';
import type { PaginatedNotes, Note } from '../../db/queries';
import { timeAgo } from '../../utils/time';

interface NotesListPageProps {
    notes: PaginatedNotes;
    search?: string;
    filter?: string;
}

export const NotesListPage: FC<NotesListPageProps> = ({ notes, search, filter }) => {
    return (
        <AdminLayout title="笔记管理">
            <div class="admin-container">
                <div class="admin-header">
                    <div class="admin-title-group">
                        <div class="admin-kicker">NOTES</div>
                        <h1>笔记管理</h1>
                        <p class="admin-subtitle">检索、筛选和处理所有笔记记录。</p>
                    </div>
                    <nav class="admin-nav">
                        <a href="/admin/dashboard">
                            <i class="fas fa-tachometer-alt"></i> 仪表盘
                        </a>
                        <a href="/admin/notes" class="active">
                            <i class="fas fa-sticky-note"></i> 笔记管理
                        </a>
                        <form action="/admin/logout" method="post" class="admin-nav-form">
                            <button type="submit" class="btn small">
                                <i class="fas fa-sign-out-alt"></i> 退出
                            </button>
                        </form>
                    </nav>
                </div>

                <form class="search-bar" method="get" action="/admin/notes">
                    <input
                        type="text"
                        name="search"
                        placeholder="搜索笔记..."
                        value={search || ''}
                    />
                    <select name="filter">
                        <option value="all" selected={filter === 'all' || !filter}>全部</option>
                        <option value="public" selected={filter === 'public'}>公开</option>
                        <option value="private" selected={filter === 'private'}>私有</option>
                        <option value="protected" selected={filter === 'protected'}>受保护</option>
                    </select>
                    <button type="submit" class="btn primary">搜索</button>
                </form>

                <section class="admin-panel">
                    <div class="panel-header">
                        <div>
                            <h2>笔记列表</h2>
                            <p class="panel-note">当前筛选结果共 {notes.total} 条。</p>
                        </div>
                    </div>
                    <div class="table-wrap">
                        <table class="notes-table">
                            <thead>
                                <tr>
                                    <th>Key</th>
                                    <th>状态</th>
                                    <th>内容预览</th>
                                    <th>更新时间</th>
                                    <th>操作</th>
                                </tr>
                            </thead>
                            <tbody>
                                {notes.notes.length === 0 ? (
                                    <tr>
                                        <td colSpan={5} class="admin-empty">
                                            暂无笔记
                                        </td>
                                    </tr>
                                ) : (
                                    notes.notes.map(note => (
                                        <tr>
                                            <td>
                                                <a href={`/${note.key}`} target="_blank" class="note-key-link">{note.key}</a>
                                            </td>
                                            <td>
                                                {note.password && !Boolean(note.public) && <span class="status-badge private">私有</span>}
                                                {note.password && Boolean(note.public) && <span class="status-badge protected">受保护</span>}
                                                {!note.password && <span class="status-badge public">公开</span>}
                                            </td>
                                            <td class="note-preview-cell">
                                                {note.encrypted ? '[已加密]' : (note.content.slice(0, 50) + (note.content.length > 50 ? '...' : ''))}
                                            </td>
                                            <td>{timeAgo(note.updated_at)}</td>
                                            <td>
                                                <span class="table-actions">
                                                    <a href={`/admin/notes/${note.key}`} class="btn small" title="查看详情">
                                                        <i class="fas fa-eye"></i>
                                                    </a>
                                                    <button
                                                        class="btn small danger"
                                                        title="删除笔记"
                                                        onclick={`if(confirm('确定删除笔记 ${note.key}？')) fetch('/admin/notes/${note.key}', {method:'DELETE'}).then(()=>location.reload())`}
                                                    >
                                                        <i class="fas fa-trash"></i>
                                                    </button>
                                                </span>
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                </section>

                {notes.totalPages > 1 && (
                    <div class="pagination">
                        {notes.page > 1 && (
                            <a href={`/admin/notes?page=${notes.page - 1}${search ? `&search=${search}` : ''}${filter ? `&filter=${filter}` : ''}`}>
                                &laquo; 上一页
                            </a>
                        )}
                        {Array.from({ length: notes.totalPages }, (_, i) => i + 1).map(p => (
                            <a
                                href={`/admin/notes?page=${p}${search ? `&search=${search}` : ''}${filter ? `&filter=${filter}` : ''}`}
                                class={p === notes.page ? 'active' : ''}
                            >
                                {p}
                            </a>
                        ))}
                        {notes.page < notes.totalPages && (
                            <a href={`/admin/notes?page=${notes.page + 1}${search ? `&search=${search}` : ''}${filter ? `&filter=${filter}` : ''}`}>
                                下一页 &raquo;
                            </a>
                        )}
                    </div>
                )}

                <p class="list-summary">
                    共 {notes.total} 条笔记，当前第 {notes.page} 页，共 {notes.totalPages} 页
                </p>
            </div>
        </AdminLayout>
    );
};

interface NoteDetailPageProps {
    note: Note & { decryptedContent?: string };
}

export const NoteDetailPage: FC<NoteDetailPageProps> = ({ note }) => {
    return (
        <AdminLayout title={`笔记详情 - ${note.key}`}>
            <div class="admin-container">
                <div class="admin-header">
                    <div class="admin-title-group">
                        <div class="admin-kicker">NOTE DETAIL</div>
                        <h1>笔记详情: {note.key}</h1>
                        <p class="admin-subtitle">查看笔记状态、加密情况和内容预览。</p>
                    </div>
                    <nav class="admin-nav">
                        <a href="/admin/notes">
                            <i class="fas fa-arrow-left"></i> 返回列表
                        </a>
                        <a href={`/${note.key}`} target="_blank">
                            <i class="fas fa-external-link-alt"></i> 查看笔记
                        </a>
                    </nav>
                </div>

                <div class="stats-grid">
                    <div class="stat-card">
                        <h3>状态</h3>
                        <span class="stat-icon"><i class="fas fa-shield-alt"></i></span>
                        <div class="stat-detail">
                            {note.password && !Boolean(note.public) && <span class="status-badge private">私有笔记</span>}
                            {note.password && Boolean(note.public) && <span class="status-badge protected">受保护公开</span>}
                            {!note.password && <span class="status-badge public">公开笔记</span>}
                        </div>
                    </div>
                    <div class="stat-card">
                        <h3>加密</h3>
                        <span class="stat-icon"><i class="fas fa-key"></i></span>
                        <div class="stat-detail">{note.encrypted ? '是' : '否'}</div>
                    </div>
                    <div class="stat-card">
                        <h3>更新时间</h3>
                        <span class="stat-icon"><i class="fas fa-clock"></i></span>
                        <div class="stat-detail">{timeAgo(note.updated_at)}</div>
                    </div>
                </div>

                <section class="admin-panel">
                    <div class="panel-header">
                        <div>
                            <h2>内容预览</h2>
                            <p class="panel-note">仅用于管理复核，编辑请打开笔记原页面。</p>
                        </div>
                    </div>
                    <div class="note-preview-box">
                        {note.encrypted ? (note.decryptedContent || '[已加密，无法预览]') : note.content}
                    </div>
                </section>

                <div class="admin-actions">
                    <a href={`/${note.key}`} target="_blank" class="btn primary">
                        <i class="fas fa-edit"></i> 编辑笔记
                    </a>
                    <button
                        class="btn danger"
                        onclick={`if(confirm('确定删除笔记 ${note.key}？此操作不可撤销！')) fetch('/admin/notes/${note.key}', {method:'DELETE'}).then(()=>location.href='/admin/notes')`}
                    >
                        <i class="fas fa-trash"></i> 删除笔记
                    </button>
                </div>
            </div>
        </AdminLayout>
    );
};
