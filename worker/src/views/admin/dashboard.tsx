import type { FC } from 'hono/jsx';
import { AdminLayout } from '../layouts/base';
import type { Stats } from '../../db/queries';
import { timeAgo } from '../../utils/time';

interface DashboardPageProps {
    stats: Stats;
}

export const DashboardPage: FC<DashboardPageProps> = ({ stats }) => {
    return (
        <AdminLayout title="仪表盘">
            <div class="admin-container">
                <div class="admin-header">
                    <h1>YoNote 管理后台</h1>
                    <nav class="admin-nav">
                        <a href="/admin/dashboard" class="active">
                            <i class="fas fa-tachometer-alt"></i> 仪表盘
                        </a>
                        <a href="/admin/notes">
                            <i class="fas fa-sticky-note"></i> 笔记管理
                        </a>
                        <form action="/admin/logout" method="post" style="display: inline;">
                            <button type="submit" class="btn small">
                                <i class="fas fa-sign-out-alt"></i> 退出
                            </button>
                        </form>
                    </nav>
                </div>

                <div class="stats-grid">
                    <div class="stat-card">
                        <h3><i class="fas fa-file-alt"></i> 笔记总数</h3>
                        <div class="value">{stats.total}</div>
                    </div>
                    <div class="stat-card">
                        <h3><i class="fas fa-globe"></i> 公开笔记</h3>
                        <div class="value">{stats.public}</div>
                    </div>
                    <div class="stat-card">
                        <h3><i class="fas fa-lock"></i> 私有笔记</h3>
                        <div class="value">{stats.private}</div>
                    </div>
                    <div class="stat-card">
                        <h3><i class="fas fa-shield-alt"></i> 受保护笔记</h3>
                        <div class="value">{stats.protected}</div>
                    </div>
                    <div class="stat-card empty-notes">
                        <h3><i class="fas fa-file"></i> 空笔记</h3>
                        <div class="value">{stats.empty}</div>
                        {stats.empty > 0 && (
                            <button
                                type="button"
                                class="btn danger small delete-empty-btn"
                                onclick="deleteEmptyNotes()"
                            >
                                <i class="fas fa-trash"></i> 一键清理
                            </button>
                        )}
                    </div>
                </div>

                <h2>最近更新的笔记</h2>
                <table class="notes-table">
                    <thead>
                        <tr>
                            <th>Key</th>
                            <th>状态</th>
                            <th>更新时间</th>
                            <th>操作</th>
                        </tr>
                    </thead>
                    <tbody>
                        {stats.recentNotes.map(note => (
                            <tr>
                                <td>
                                    <a href={`/${note.key}`} target="_blank">{note.key}</a>
                                </td>
                                <td>
                                    {note.password && !note.public && <span class="status-badge private">私有</span>}
                                    {note.password && note.public && <span class="status-badge protected">受保护</span>}
                                    {!note.password && <span class="status-badge public">公开</span>}
                                </td>
                                <td>{timeAgo(note.updated_at)}</td>
                                <td>
                                    <a href={`/admin/notes/${note.key}`} class="btn small">
                                        <i class="fas fa-eye"></i>
                                    </a>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </AdminLayout>
    );
};
