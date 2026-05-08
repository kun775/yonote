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
                    <div class="admin-title-group">
                        <div class="admin-kicker">YONOTE ADMIN</div>
                        <h1>管理后台</h1>
                        <p class="admin-subtitle">查看笔记状态、访问最近更新内容，并清理无效空笔记。</p>
                    </div>
                    <nav class="admin-nav">
                        <a href="/admin/dashboard" class="active">
                            <i class="fas fa-tachometer-alt"></i> 仪表盘
                        </a>
                        <a href="/admin/notes">
                            <i class="fas fa-sticky-note"></i> 笔记管理
                        </a>
                        <form action="/admin/logout" method="post" class="admin-nav-form">
                            <button type="submit" class="btn small">
                                <i class="fas fa-sign-out-alt"></i> 退出
                            </button>
                        </form>
                    </nav>
                </div>

                <div class="stats-grid">
                    <div class="stat-card">
                        <h3>笔记总数</h3>
                        <span class="stat-icon"><i class="fas fa-file-alt"></i></span>
                        <div class="value">{stats.total}</div>
                        <div class="stat-hint">当前数据库记录</div>
                    </div>
                    <div class="stat-card">
                        <h3>公开笔记</h3>
                        <span class="stat-icon"><i class="fas fa-globe"></i></span>
                        <div class="value">{stats.public}</div>
                        <div class="stat-hint">无需密码访问</div>
                    </div>
                    <div class="stat-card">
                        <h3>私有笔记</h3>
                        <span class="stat-icon"><i class="fas fa-lock"></i></span>
                        <div class="value">{stats.private}</div>
                        <div class="stat-hint">需要密码查看</div>
                    </div>
                    <div class="stat-card">
                        <h3>受保护笔记</h3>
                        <span class="stat-icon"><i class="fas fa-shield-alt"></i></span>
                        <div class="value">{stats.protected}</div>
                        <div class="stat-hint">公开查看，编辑受限</div>
                    </div>
                    <div class="stat-card empty-notes">
                        <h3>空笔记</h3>
                        <span class="stat-icon"><i class="fas fa-file"></i></span>
                        <div class="value">{stats.empty}</div>
                        <div class="stat-hint">可按需清理</div>
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

                <section class="admin-panel">
                    <div class="panel-header">
                        <div>
                            <h2>最近更新的笔记</h2>
                            <p class="panel-note">按更新时间倒序展示，便于快速复核近期变更。</p>
                        </div>
                        <a href="/admin/notes" class="btn small">
                            <i class="fas fa-list"></i> 查看全部
                        </a>
                    </div>
                    <div class="table-wrap">
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
                                {stats.recentNotes.length === 0 ? (
                                    <tr>
                                        <td colSpan={4} class="admin-empty">
                                            暂无最近更新
                                        </td>
                                    </tr>
                                ) : (
                                    stats.recentNotes.map(note => (
                                        <tr>
                                            <td>
                                                <a href={`/${note.key}`} target="_blank" class="note-key-link">{note.key}</a>
                                            </td>
                                            <td>
                                                {note.password && !Boolean(note.public) && <span class="status-badge private">私有</span>}
                                                {note.password && Boolean(note.public) && <span class="status-badge protected">受保护</span>}
                                                {!note.password && <span class="status-badge public">公开</span>}
                                            </td>
                                            <td>{timeAgo(note.updated_at)}</td>
                                            <td>
                                                <a href={`/admin/notes/${note.key}`} class="btn small" title="查看详情">
                                                    <i class="fas fa-eye"></i>
                                                </a>
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                </section>
            </div>
        </AdminLayout>
    );
};
