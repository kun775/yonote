import type { FC } from 'hono/jsx';
import { BaseLayout } from '../layouts/base';
import type { Note } from '../../db/queries';
import { timeAgo } from '../../utils/time';

interface ViewPageProps {
    note: Note & { decryptedContent: string };
    viewOnly: boolean;
    authenticated: boolean;
    baseUrl: string;
}

export const ViewPage: FC<ViewPageProps> = ({ note, viewOnly, authenticated, baseUrl }) => {
    const statusBadge = () => {
        if (note.password && !note.public) {
            return <span class="status-badge private">私有笔记</span>;
        } else if (note.password && note.public) {
            return <span class="status-badge protected">受保护公开</span>;
        } else {
            return <span class="status-badge public">公开笔记</span>;
        }
    };

    const shareUrl = note.public
        ? `${baseUrl}/${note.key}?view=1`
        : `${baseUrl}/${note.key}`;

    return (
        <BaseLayout
            title={note.key}
            noteKey={note.key}
            authenticated={authenticated}
            viewOnly={viewOnly}
            hasPassword={!!note.password}
            isPublic={!!note.public}
            updatedAt={note.updated_at}
        >
            <div class="container" data-updated-at={note.updated_at}>
                <div class="note-content">
                    <div class="editor-container" data-view-only={viewOnly ? 'true' : 'false'}>
                        <div class={`editor${!viewOnly ? ' has-toolbar' : ''}`}>
                            {!viewOnly && (
                                <div class="editor-toolbar" id="editor-toolbar">
                                    <button type="button" class="toolbar-btn" data-action="heading1" title="一级标题">H1</button>
                                    <button type="button" class="toolbar-btn" data-action="heading2" title="二级标题">H2</button>
                                    <button type="button" class="toolbar-btn" data-action="heading3" title="三级标题">H3</button>
                                    <span class="toolbar-divider"></span>
                                    <button type="button" class="toolbar-btn" data-action="bold" title="粗体"><i class="fas fa-bold"></i></button>
                                    <button type="button" class="toolbar-btn" data-action="italic" title="斜体"><i class="fas fa-italic"></i></button>
                                    <button type="button" class="toolbar-btn" data-action="strikethrough" title="删除线"><i class="fas fa-strikethrough"></i></button>
                                    <button type="button" class="toolbar-btn" data-action="highlight" title="高亮"><i class="fas fa-highlighter"></i></button>
                                    <span class="toolbar-divider"></span>
                                    <button type="button" class="toolbar-btn" data-action="ul" title="无序列表"><i class="fas fa-list-ul"></i></button>
                                    <button type="button" class="toolbar-btn" data-action="ol" title="有序列表"><i class="fas fa-list-ol"></i></button>
                                    <button type="button" class="toolbar-btn" data-action="task" title="任务列表"><i class="fas fa-tasks"></i></button>
                                    <span class="toolbar-divider"></span>
                                    <button type="button" class="toolbar-btn" data-action="table" title="表格"><i class="fas fa-table"></i></button>
                                    <button type="button" class="toolbar-btn" data-action="code" title="代码块"><i class="fas fa-code"></i></button>
                                    <button type="button" class="toolbar-btn" data-action="quote" title="引用"><i class="fas fa-quote-left"></i></button>
                                    <button type="button" class="toolbar-btn" data-action="link" title="链接"><i class="fas fa-link"></i></button>
                                    <button type="button" class="toolbar-btn" data-action="image" title="图片"><i class="fas fa-image"></i></button>
                                    <span class="toolbar-divider"></span>
                                    <button type="button" class="toolbar-btn" data-action="hr" title="分隔线"><i class="fas fa-minus"></i></button>
                                </div>
                            )}
                            <textarea
                                id="content"
                                name="content"
                                placeholder="开始输入。。。支持Markdown语法，并实时预览"
                                data-note-key={note.key}
                                readonly={viewOnly}
                            >{note.decryptedContent}</textarea>
                        </div>
                        <div class="resizer" id="resizer"></div>
                        <div class="preview markdown-body" id="preview"></div>
                    </div>
                </div>

                <div class="note-footer floating">
                    <div class="note-info">
                        <span class="key-badge">{note.key}</span>
                        {statusBadge()}
                        <span id="last-updated">最后更新：{timeAgo(note.updated_at)}</span>
                    </div>

                    <div class="note-actions">
                        <div class="action-buttons">
                            <button id="new-note-btn" class="btn small" onclick="window.location.href='/'">
                                <i class="fas fa-file"></i> 新建
                            </button>

                            {viewOnly && (
                                <a href={`/${note.key}`} class="btn small">
                                    <i class="fas fa-edit"></i> 编辑
                                </a>
                            )}

                            {(!viewOnly || authenticated) && (
                                <>
                                    <button id="preview-toggle-btn" class="btn small" data-has-password={note.password ? 'true' : 'false'}>
                                        <i class="fas fa-eye"></i> 预览
                                    </button>
                                    <button id="settings-btn" class="btn small">
                                        <i class="fas fa-cog"></i> 设置
                                    </button>
                                </>
                            )}

                            <button id="share-btn" class="btn small">
                                <i class="fas fa-share-alt"></i> 分享
                            </button>
                            <button id="download-btn" class="btn small">
                                <i class="fas fa-download"></i> 下载
                            </button>
                            <button id="help-btn" class="btn small">
                                <i class="fas fa-question-circle"></i> 帮助
                            </button>
                        </div>
                    </div>
                </div>

                {(!viewOnly || authenticated) && (
                    <div id="settings-panel" class="settings-panel hidden">
                        <div class="settings-header">
                            <h3>笔记设置</h3>
                            <span class="close-settings">&times;</span>
                        </div>

                        <form id="settings-form" method="post" action={`/${note.key}/update`}>
                            <input type="hidden" name="content" id="settings-content-input" value={note.decryptedContent} />

                            <div class="settings-section">
                                <h4><i class="fas fa-lock"></i> 安全设置</h4>
                                <div class="form-group">
                                    <label>密码保护：</label>
                                    <div class="radio-group">
                                        {note.password ? (
                                            <>
                                                <div class="radio-option">
                                                    <input type="radio" id="password-keep" name="password_action" value="keep" checked />
                                                    <label for="password-keep">保持不变</label>
                                                </div>
                                                <div class="radio-option">
                                                    <input type="radio" id="password-remove" name="password_action" value="remove" />
                                                    <label for="password-remove">移除密码</label>
                                                </div>
                                                <div class="radio-option">
                                                    <input type="radio" id="password-change" name="password_action" value="change" />
                                                    <label for="password-change">更改密码</label>
                                                </div>
                                            </>
                                        ) : (
                                            <>
                                                <div class="radio-option">
                                                    <input type="radio" id="password-keep" name="password_action" value="keep" checked />
                                                    <label for="password-keep">无密码</label>
                                                </div>
                                                <div class="radio-option">
                                                    <input type="radio" id="password-change" name="password_action" value="change" />
                                                    <label for="password-change">设置密码</label>
                                                </div>
                                            </>
                                        )}
                                    </div>
                                </div>
                                <div id="current-password-container" class="form-group hidden">
                                    <label for="current-password">当前密码：</label>
                                    <input type="password" id="current-password" name="current_password" />
                                    <p class="form-help">修改或移除密码前需要验证当前密码</p>
                                </div>
                                <div id="new-password-container" class="form-group hidden">
                                    <label for="new-password">新密码：</label>
                                    <input type="password" id="new-password" name="new_password" />
                                </div>
                            </div>

                            <div class="settings-section">
                                <h4><i class="fas fa-eye"></i> 可见性设置</h4>
                                <div class="form-group" id="public-option-container" style={!note.password ? 'opacity: 0.5;' : ''}>
                                    <label class="checkbox-option">
                                        <input type="checkbox" name="public" id="public-checkbox" checked={!!note.public} disabled={!note.password} />
                                        <span class="warning-text">无需密码即可查看</span>
                                    </label>
                                    <p class="form-help">
                                        {note.password && !note.public && (
                                            <><span class="status-badge private">私有笔记</span> 有密码保护且不公开，需要密码才能查看和编辑</>
                                        )}
                                        {note.password && note.public && (
                                            <><span class="status-badge protected">受保护公开</span> 有密码保护但可以公开查看，需要密码才能编辑</>
                                        )}
                                        {!note.password && (
                                            <><span class="status-badge public">公开笔记</span> 没有密码保护，任何人都可以查看和编辑</>
                                        )}
                                    </p>
                                </div>
                            </div>

                            <div class="settings-section settings-section-danger">
                                <h4><i class="fas fa-cog"></i> 其他操作</h4>
                                <div class="form-actions">
                                    <button type="button" id="delete-note-btn" class="btn danger">
                                        <i class="fas fa-trash-alt"></i> 删除笔记
                                    </button>
                                    <button type="submit" class="btn primary">
                                        <i class="fas fa-save"></i> 保存设置
                                    </button>
                                </div>
                            </div>
                        </form>
                    </div>
                )}

                {/* Help Modal */}
                <div id="helpModal" class="custom-modal">
                    <div class="custom-modal-content">
                        <div class="custom-modal-header">
                            <h5>使用帮助
                                <a href="https://github.com/kun775/yonote" target="_blank" class="btn small">
                                    <i class="fab fa-github"></i> Github
                                </a>
                            </h5>
                            <span class="custom-modal-close">&times;</span>
                        </div>
                        <div class="custom-modal-body">
                            <div class="help-section">
                                <h5>基本功能</h5>
                                <ul>
                                    <li><strong>实时预览：</strong> 输入内容后，会实时显示Markdown渲染效果。</li>
                                    <li><strong>自动保存：</strong> 内容会自动保存，无需手动点击保存按钮。</li>
                                    <li><strong>密码保护：</strong> 可以设置密码保护您的笔记，防止未授权访问。</li>
                                    <li><strong>公开/私密：</strong> 可以选择将笔记设为公开或私密。</li>
                                    <li><strong>复制链接：</strong> 点击"复制链接"按钮可以获取笔记的分享链接。</li>
                                    <li><strong>查看模式：</strong> 链接后加?view=1可以获得更好的阅读体验。</li>
                                </ul>
                            </div>
                            <div class="help-section">
                                <h5>Markdown语法</h5>
                                <ul>
                                    <li><strong>标题：</strong> 使用 # 符号，例如：<code># 一级标题</code>，<code>## 二级标题</code></li>
                                    <li><strong>列表：</strong> 使用 - 或 * 创建无序列表，使用 1. 2. 创建有序列表</li>
                                    <li><strong>链接：</strong> <code>[链接文本](URL)</code></li>
                                    <li><strong>图片：</strong> <code>![替代文本](图片URL)</code></li>
                                    <li><strong>粗体：</strong> <code>**文本**</code> 或 <code>__文本__</code></li>
                                    <li><strong>斜体：</strong> <code>*文本*</code> 或 <code>_文本_</code></li>
                                    <li><strong>代码：</strong> <code>`行内代码`</code> 或使用三个反引号包裹多行代码块</li>
                                </ul>
                            </div>
                        </div>
                        <div class="custom-modal-footer">
                            <button type="button" class="btn small custom-modal-close-btn">关闭</button>
                        </div>
                    </div>
                </div>

                {/* Delete Modal */}
                <div id="delete-modal" class="modal hidden">
                    <div class="modal-content">
                        <div class="modal-header">
                            <h3>确认删除</h3>
                            <span class="close-modal">&times;</span>
                        </div>
                        <div class="modal-body">
                            <p><span class="warning-text"><strong>警告：</strong>您即将删除此笔记，此操作不可撤销。</span></p>
                            <p>笔记ID: <span class="key-badge">{note.key}</span></p>
                            {note.password && (
                                <div class="form-group">
                                    <label for="delete-password">请输入密码确认删除：</label>
                                    <input type="password" id="delete-password" class="full-width" />
                                    <p class="error-message hidden" id="delete-password-error">密码错误</p>
                                </div>
                            )}
                        </div>
                        <div class="modal-footer">
                            <button class="btn secondary" id="cancel-delete">取消</button>
                            <button class="btn danger" id="confirm-delete">删除</button>
                        </div>
                    </div>
                </div>

                {/* Share Modal */}
                <div id="share-modal" class="modal hidden">
                    <div class="modal-content">
                        <div class="modal-header">
                            <h3>分享选项</h3>
                            <span class="close-modal">&times;</span>
                        </div>
                        <div class="modal-body">
                            <div class="share-option">
                                <h4>复制笔记链接</h4>
                                <div class="share-link-container">
                                    <input type="text" readonly value={shareUrl} id="share-link" />
                                    <button id="copy-link-btn" class="btn btn-secondary">
                                        <i class="fas fa-link"></i> 复制链接
                                    </button>
                                </div>
                                <p class="form-help">分享此链接，其他人可以{note.public ? '查看' : '访问'}此笔记</p>
                            </div>
                            <div class="share-option">
                                <h4>复制笔记内容</h4>
                                <button class="btn full-width" id="copy-content-btn">复制全部内容</button>
                                <p class="form-help">将笔记的全部文本内容复制到剪贴板</p>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Download Password Modal */}
                <div id="download-password-modal" class="modal hidden">
                    <div class="modal-content">
                        <div class="modal-header">
                            <h3>密码验证</h3>
                            <span class="close-modal">&times;</span>
                        </div>
                        <div class="modal-body">
                            <p>此笔记受密码保护，请输入密码以下载内容：</p>
                            <div class="form-group">
                                <label for="download-password">密码：</label>
                                <input type="password" id="download-password" class="full-width" />
                                <p class="error-message hidden" id="download-password-error">密码错误</p>
                            </div>
                        </div>
                        <div class="modal-footer">
                            <button class="btn secondary" id="cancel-download">取消</button>
                            <button class="btn primary" id="confirm-download">下载</button>
                        </div>
                    </div>
                </div>

                {/* Preview Password Modal */}
                <div id="preview-password-modal" class="modal hidden">
                    <div class="modal-content">
                        <div class="modal-header">
                            <h3>密码验证</h3>
                            <span class="close-modal">&times;</span>
                        </div>
                        <div class="modal-body">
                            <p>此笔记受密码保护,请输入密码以切换到编辑模式:</p>
                            <div class="form-group">
                                <label for="preview-password">密码:</label>
                                <input type="password" id="preview-password" class="full-width" placeholder="请输入密码" />
                                <p class="error-message hidden" id="preview-password-error">密码错误</p>
                            </div>
                        </div>
                        <div class="modal-footer">
                            <button class="btn secondary" id="cancel-preview-password">取消</button>
                            <button class="btn primary" id="confirm-preview-password">确认</button>
                        </div>
                    </div>
                </div>
            </div>
        </BaseLayout>
    );
};
