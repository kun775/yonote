// 控制台输出YONOTE字样和版本信息
console.log(`
 __   __  _______  __    _  _______  _______  _______
|  | |  ||       ||  |  | ||       ||       ||       |
|  |_|  ||   _   ||   |_| ||   _   ||_     _||    ___|
|       ||  | |  ||       ||  | |  |  |   |  |   |___
|_     _||  |_|  ||  _    ||  |_|  |  |   |  |    ___|
  |   |  |       || | |   ||       |  |   |  |   |___
  |___|  |_______||_|  |__||_______|  |___|  |_______|

版本: 1.0.0 | 作者: vitawong | github: kun775/yonote
`);

// 自动保存功能
let saveTimeout;

// 初始化公开选项状态
updatePublicOption();
adjustTextareaHeight();

window.addEventListener('resize', adjustTextareaHeight);
document.addEventListener('DOMContentLoaded', adjustTextareaHeight);

// 拖拽分栏初始化函数
function initResizer() {
    const resizer = document.getElementById('resizer');
    const container = document.querySelector('.editor-container');
    const editorDiv = container ? container.querySelector('.editor') : null;

    if (!resizer || !container || !editorDiv || !isPC()) return;

    let isResizing = false;

    resizer.addEventListener('mousedown', (e) => {
        isResizing = true;
        resizer.classList.add('active');
        document.body.style.cursor = 'col-resize';
        document.body.style.userSelect = 'none';
        e.preventDefault();
    });

    document.addEventListener('mousemove', (e) => {
        if (!isResizing) return;
        const containerRect = container.getBoundingClientRect();
        const newWidth = e.clientX - containerRect.left;
        const percent = (newWidth / containerRect.width) * 100;

        // 限制范围 20%-80%
        if (percent >= 20 && percent <= 80) {
            editorDiv.style.flex = `0 0 ${percent}%`;
            localStorage.setItem('editorWidth', percent);
        }
    });

    document.addEventListener('mouseup', () => {
        if (isResizing) {
            isResizing = false;
            resizer.classList.remove('active');
            document.body.style.cursor = '';
            document.body.style.userSelect = '';
        }
    });

    // 恢复保存的宽度
    const savedWidth = localStorage.getItem('editorWidth');
    if (savedWidth) {
        editorDiv.style.flex = `0 0 ${savedWidth}%`;
    }
}

// 每秒更新时间显示（使用前端计算，不请求服务器）
setInterval(updateTimeAgo, 1000);
updateTimeAgo(); // 立即更新一次

document.addEventListener('DOMContentLoaded', (event) => {
    const editor = document.getElementById('content');
    const editorContainer1 = editor.parentElement; // 获取编辑区容器
    const contentInput = document.getElementById('content');
    const settingsContentInput = document.getElementById('settings-content-input');
    const previewToggleBtn = document.getElementById('preview-toggle-btn');
    const editorContainer = document.getElementById('editor-container');
    const previewContainer = document.getElementById('preview');
    const lastUpdatedElement = document.getElementById('last-updated');
    const newPasswordContainer = document.getElementById('new-password-container');
    // 设置面板
    const settingsBtn = document.getElementById('settings-btn');
    const settingsPanel = document.getElementById('settings-panel');
    const closeSettings = document.querySelector('.close-settings');
    // 密码设置和公开选项联动
    const passwordRadios = document.querySelectorAll('input[name="password_action"]');
    const publicCheckbox = document.getElementById('public-checkbox');
    const publicOptionContainer = document.getElementById('public-option-container');

    // Flash 消息自动消失
    const flashMessages = document.querySelectorAll('.flash-message');
    if (flashMessages.length > 0) {
        flashMessages.forEach(msg => {
            setTimeout(() => {
                msg.style.display = 'none';
            }, 3000); // 3秒后隐藏（0.3s淡入 + 2.7s显示）
        });
    }

    // 初始化拖拽分栏
    initResizer();

    // 从全局变量中获取
   
    const noteKey = window.noteKey; // 使用传递的 note key

    // 安全提示模态框
    const securityInfoBtn = document.getElementById('security-info-btn');
    const securityModal = document.getElementById('security-modal');
    const closeSecurityModal = document.getElementById('close-security-modal');
    const closeModalBtn = securityModal ? securityModal.querySelector('.close-modal') : null;

    if (securityInfoBtn && securityModal) {
        securityInfoBtn.addEventListener('click', function() {
            securityModal.classList.remove('hidden');
        });
    }

    if (closeSecurityModal && securityModal) {
        closeSecurityModal.addEventListener('click', function() {
            securityModal.classList.add('hidden');
        });
    }

    if (closeModalBtn && securityModal) {
        closeModalBtn.addEventListener('click', function() {
            securityModal.classList.add('hidden');
        });
    }


    // 下载功能
    const downloadBtn = document.getElementById('download-btn');
    const downloadPasswordModal = document.getElementById('download-password-modal');
    const downloadPasswordInput = document.getElementById('download-password');
    const downloadPasswordError = document.getElementById('download-password-error');
    const cancelDownloadBtn = document.getElementById('cancel-download');
    const confirmDownloadBtn = document.getElementById('confirm-download');
    const closeDownloadModalBtn = downloadPasswordModal ? downloadPasswordModal.querySelector('.close-modal') : null;
    const downloadPasswordGroup = document.getElementById('download-password-group');
    const downloadFormatTxt = document.getElementById('download-format-txt');
    const downloadFormatPdf = document.getElementById('download-format-pdf');

    const getSelectedDownloadFormat = () => {
        const selected = document.querySelector('input[name="download-format"]:checked');
        return selected ? selected.value : 'txt';
    };

    const requiresDownloadPassword = () => Boolean(window.password && !window.authenticated);

    const showDownloadError = (message) => {
        const text = message || '密码错误';
        const canShowInline = downloadPasswordError
            && !(downloadPasswordGroup && downloadPasswordGroup.classList.contains('hidden'));

        if (canShowInline) {
            downloadPasswordError.textContent = text;
            downloadPasswordError.classList.remove('hidden');
            return;
        }

        const notification = document.createElement('div');
        notification.className = 'save-indicator error';
        notification.textContent = text;
        document.body.appendChild(notification);
        setTimeout(() => notification.remove(), 2200);
    };

    const openDownloadModal = () => {
        if (!downloadPasswordModal) return;

        const needPassword = requiresDownloadPassword();
        downloadPasswordModal.classList.remove('hidden');

        if (downloadFormatTxt) {
            downloadFormatTxt.checked = true;
        }
        if (downloadFormatPdf) {
            downloadFormatPdf.checked = false;
        }

        if (downloadPasswordGroup) {
            downloadPasswordGroup.classList.toggle('hidden', !needPassword);
        }
        if (downloadPasswordInput) {
            downloadPasswordInput.value = '';
            downloadPasswordInput.required = needPassword;
        }
        if (downloadPasswordError) {
            downloadPasswordError.classList.add('hidden');
            downloadPasswordError.textContent = '密码错误';
        }
    };

    const closeDownloadModal = () => {
        if (downloadPasswordModal) {
            downloadPasswordModal.classList.add('hidden');
        }
    };

    if (cancelDownloadBtn) {
        cancelDownloadBtn.addEventListener('click', function() {
            closeDownloadModal();
        });
    }

    if (closeDownloadModalBtn) {
        closeDownloadModalBtn.addEventListener('click', function() {
            closeDownloadModal();
        });
    }

    if (confirmDownloadBtn) {
        confirmDownloadBtn.addEventListener('click', function() {
            (async () => {
                const noteContent = contentInput ? contentInput.value : '';
                if (!noteContent.trim()) {
                    const notification = document.createElement('div');
                    notification.className = 'save-indicator';
                    notification.textContent = '笔记内容为空，无法下载';
                    document.body.appendChild(notification);
                    setTimeout(() => notification.remove(), 2000);
                    return;
                }

                const format = getSelectedDownloadFormat();
                const needPassword = requiresDownloadPassword();

                if (needPassword) {
                    const password = downloadPasswordInput ? downloadPasswordInput.value : '';
                    if (!password.trim()) {
                        showDownloadError('请输入密码');
                        return;
                    }
                    const response = await fetch(`/${noteKey}/verify-download`, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                        },
                        body: JSON.stringify({ password: password }),
                    });
                    const data = await response.json();

                    if (!data.success) {
                        showDownloadError(data.message || '密码错误');
                        return;
                    }

                    window.authenticated = true;
                    closeDownloadModal();
                    await new Promise((resolve) => window.requestAnimationFrame(resolve));

                    await downloadNote({
                        format,
                        content: noteContent
                    });
                } else {
                    closeDownloadModal();
                    await new Promise((resolve) => window.requestAnimationFrame(resolve));

                    await downloadNote({
                        format,
                        content: noteContent
                    });
                }
            })().catch((error) => {
                console.error('download error:', error);
                if (error && error.message === 'PDF_LIB_MISSING') {
                    showDownloadError('PDF 功能加载失败，请稍后重试');
                    return;
                }
                const notification = document.createElement('div');
                notification.className = 'save-indicator error';
                notification.textContent = '下载失败，请稍后重试';
                document.body.appendChild(notification);
                setTimeout(() => notification.remove(), 2200);
            });
        });
    }

    if (downloadBtn) {
        downloadBtn.addEventListener('click', function() {
            const noteContent = contentInput ? contentInput.value.trim() : '';
             
            if (!noteContent) {
                // 内容为空，显示提示
                const notification = document.createElement('div');
                notification.className = 'save-indicator';
                notification.textContent = '笔记内容为空，无法下载';
                document.body.appendChild(notification);
                
                setTimeout(() => {
                    notification.remove();
                }, 2000);
                return;
            }

            if (downloadPasswordModal) {
                openDownloadModal();
            } else {
                downloadNote({
                    format: 'txt',
                    content: noteContent
                }).catch((error) => console.error('download fallback error:', error));
            }
        });
    }

    if (contentInput) {
        contentInput.addEventListener('input', function() {
            if (saveTimeout) {
                clearTimeout(saveTimeout);
            }
            
            // 同步到设置表单
            if (settingsContentInput) {
                settingsContentInput.value = contentInput.value;
            }
            
            saveTimeout = setTimeout(autoSave, 1000);
        });
    }

    if (settingsBtn && settingsPanel) {
        settingsBtn.addEventListener('click', function() {
            settingsPanel.classList.remove('hidden');
        });
    }

    if (closeSettings && settingsPanel) {
        closeSettings.addEventListener('click', function() {
            settingsPanel.classList.add('hidden');
        });
    }

    if (passwordRadios) {
        passwordRadios.forEach(radio => {
            radio.addEventListener('change', function() {
                const currentPasswordContainer = document.getElementById('current-password-container');
                const hasPassword = window.password; // 从全局变量获取是否已有密码

                // 更新密码输入框显示
                if (this.value === 'change' && this.checked) {
                    // 更改密码/设置密码
                    if (hasPassword) {
                        // 已有密码：显示当前密码+新密码
                        if (currentPasswordContainer) {
                            currentPasswordContainer.classList.remove('hidden');
                        }
                    } else {
                        // 第一次设置密码：只显示新密码，不需要当前密码
                        if (currentPasswordContainer) {
                            currentPasswordContainer.classList.add('hidden');
                        }
                    }
                    if (newPasswordContainer) {
                        newPasswordContainer.classList.remove('hidden');
                    }
                } else if (this.value === 'remove' && this.checked) {
                    // 移除密码：只显示当前密码
                    if (currentPasswordContainer) {
                        currentPasswordContainer.classList.remove('hidden');
                    }
                    if (newPasswordContainer) {
                        newPasswordContainer.classList.add('hidden');
                    }
                } else {
                    // 保持不变/无密码：都隐藏
                    if (currentPasswordContainer) {
                        currentPasswordContainer.classList.add('hidden');
                    }
                    if (newPasswordContainer) {
                        newPasswordContainer.classList.add('hidden');
                    }
                }

                // 更新公开选项状态
                updatePublicOption();
            });
        });
    }

    // 表单提交前检查内容是否为空
    const settingsForm = document.getElementById('settings-form');
    if (settingsForm) {
        settingsForm.addEventListener('submit', function(event) {
            if (!settingsContentInput) return;
            const content = settingsContentInput.value.trim();
            if (!content) {
                event.preventDefault();
                const notification = document.createElement('div');
                notification.className = 'save-indicator error';
                notification.textContent = '笔记内容为空，无法保存设置';
                document.body.appendChild(notification);
                
                setTimeout(() => {
                    notification.remove();
                }, 2000);
            }
        });
    }

    if (typeof hljs !== 'undefined' && typeof hljs.highlightElement === 'function') {
        document.querySelectorAll('pre code').forEach((el) => {
            hljs.highlightElement(el);
        });
    }

    // 获取所有模态框和关闭按钮
    const modals = document.querySelectorAll('.modal');
    const closeButtons = document.querySelectorAll('.close-modal');
    const cancelButtons = document.querySelectorAll('[id$="-cancel"], [id^="cancel-"]');
    const settingsPanelForLock = document.getElementById('settings-panel');
    const helpModalForLock = document.getElementById('helpModal');

    // 统一弹窗锁：任意弹窗/设置面板打开时，屏蔽背景区域交互
    const refreshPopupLock = () => {
        const anyModalOpen = Array.from(modals).some((modal) => !modal.classList.contains('hidden'));
        const settingsOpen = settingsPanelForLock && !settingsPanelForLock.classList.contains('hidden');
        const helpOpen = helpModalForLock && window.getComputedStyle(helpModalForLock).display !== 'none';
        const locked = anyModalOpen || settingsOpen || helpOpen;

        document.body.classList.toggle('popup-active', locked);
        document.body.classList.toggle('modal-open', locked);
    };

    const lockTargets = Array.from(modals);
    if (settingsPanelForLock) lockTargets.push(settingsPanelForLock);
    if (helpModalForLock) lockTargets.push(helpModalForLock);

    if (lockTargets.length > 0) {
        const lockObserver = new MutationObserver(() => refreshPopupLock());
        lockTargets.forEach((target) => {
            lockObserver.observe(target, {
                attributes: true,
                attributeFilter: ['class', 'style']
            });
        });
    }

    refreshPopupLock();

    // 为所有关闭按钮添加事件监听器
    closeButtons.forEach(button => {
        button.addEventListener('click', function() {
            // 查找最近的父级模态框
            const modal = this.closest('.modal');
            if (modal) {
                modal.classList.add('hidden');
            }
        });
    });

    // 为所有取消按钮添加事件监听器
    cancelButtons.forEach(button => {
        button.addEventListener('click', function() {
            // 查找最近的父级模态框
            const modal = this.closest('.modal');
            if (modal) {
                modal.classList.add('hidden');
            }
        });
    });

    
    // 检查URL参数是否包含new=1，表示这是新创建的笔记
    const urlParams = new URLSearchParams(window.location.search);
    const isNewNote = urlParams.get('new') === '1';
    
    if (isNewNote) {
        // 显示欢迎提示
        const notification = document.createElement('div');
        notification.className = 'save-indicator';
        notification.textContent = '新笔记已创建，开始编辑吧！';
        document.body.appendChild(notification);
        
        setTimeout(() => {
            notification.remove();
        }, 2000);
        
        // 清除URL参数，避免刷新页面时再次显示提示
        window.history.replaceState({}, document.title, window.location.pathname);
    }

    
    const previewDiv = document.getElementById('preview');
    const previewButton = document.getElementById('preview-toggle-btn');
    const isViewOnly = document.querySelector('[data-view-only]')?.dataset.viewOnly === 'true';
    let isPreviewMode = false;
    
    // 配置 KaTeX 自动渲染选项
    const katexOptions = {
        delimiters: [
            {left: '$$', right: '$$', display: true},
            {left: '$', right: '$', display: false},
            {left: '\\[', right: '\\]', display: true},
            {left: '\\(', right: '\\)', display: false}
        ],
        throwOnError: false,
        output: 'html'
    };
    
    // 防抖函数
    const debounce = (func, wait) => {
        let timeout;
        return function executedFunction(...args) {
            const later = () => {
                clearTimeout(timeout);
                func(...args);
            };
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
        };
    };

    // AbortController 用于取消未完成的预览请求
    let previewAbortController = null;

    // 更新预览内容 - 使用前端 marked 库直接渲染
    const updatePreview = debounce(function(content) {
        if (!content) {
            previewDiv.innerHTML = '';
            return;
        }

        try {
            let html = '';
            if (typeof convertToHtml === 'function') {
                html = convertToHtml(content);
            } else {
                marked.setOptions({
                    breaks: true,
                    gfm: true,
                    smartLists: true
                });
                html = marked.parse(content);
            }

            if (typeof DOMPurify !== 'undefined') {
                html = DOMPurify.sanitize(html, {
                    ADD_TAGS: ['section', 'input', 'label', 'sup', 'sub', 'mark'],
                    ADD_ATTR: ['checked', 'disabled', 'type', 'id', 'class']
                });
            }
            
            previewDiv.innerHTML = html;

            // 渲染数学公式
            if (typeof renderMathInElement === 'function') {
                renderMathInElement(previewDiv, katexOptions);
            }

            // 应用代码高亮并添加复制按钮
            const canHighlight = typeof hljs !== 'undefined' && typeof hljs.highlightElement === 'function';
            previewDiv.querySelectorAll('pre code').forEach((block) => {
                if (canHighlight) {
                    hljs.highlightElement(block);
                }
                addCopyButton(block.parentElement);
            });

            // 渲染 Mermaid 图表
            renderMermaidDiagrams(previewDiv);
        } catch (error) {
            console.error('Markdown render error:', error);
            previewDiv.innerHTML = '<p style="color: red;">渲染错误</p>';
        }
    }, 300);

    // 添加代码块复制按钮
    function addCopyButton(preElement) {
        if (preElement.querySelector('.copy-code-btn')) return; // 已有按钮则跳过

        const wrapper = document.createElement('div');
        wrapper.className = 'code-block-wrapper';
        wrapper.style.position = 'relative';

        const copyBtn = document.createElement('button');
        copyBtn.className = 'copy-code-btn';
        copyBtn.innerHTML = '<i class="fas fa-copy"></i>';
        copyBtn.title = '复制代码';
        copyBtn.style.cssText = 'position:absolute;top:8px;right:8px;padding:4px 8px;font-size:12px;background:#f0f0f0;border:1px solid #ddd;border-radius:4px;cursor:pointer;opacity:0.7;transition:opacity 0.2s;z-index:10;';

        copyBtn.addEventListener('mouseenter', () => copyBtn.style.opacity = '1');
        copyBtn.addEventListener('mouseleave', () => copyBtn.style.opacity = '0.7');

        copyBtn.addEventListener('click', async () => {
            const code = preElement.querySelector('code').textContent;
            try {
                await navigator.clipboard.writeText(code);
                copyBtn.innerHTML = '<i class="fas fa-check"></i>';
                copyBtn.style.background = '#d4edda';
                setTimeout(() => {
                    copyBtn.innerHTML = '<i class="fas fa-copy"></i>';
                    copyBtn.style.background = '#f0f0f0';
                }, 2000);
            } catch (err) {
                // 降级方案
                const textarea = document.createElement('textarea');
                textarea.value = code;
                textarea.style.position = 'fixed';
                textarea.style.opacity = '0';
                document.body.appendChild(textarea);
                textarea.select();
                document.execCommand('copy');
                document.body.removeChild(textarea);
                copyBtn.innerHTML = '<i class="fas fa-check"></i>';
                setTimeout(() => {
                    copyBtn.innerHTML = '<i class="fas fa-copy"></i>';
                }, 2000);
            }
        });

        preElement.style.position = 'relative';
        preElement.appendChild(copyBtn);
    }

    // 渲染 Mermaid 图表
    function renderMermaidDiagrams(container) {
        if (typeof mermaid === 'undefined') return;

        // 初始化 mermaid
        mermaid.initialize({
            startOnLoad: false,
            theme: 'default',
            securityLevel: 'strict'
        });

        // 查找 mermaid 代码块
        container.querySelectorAll('pre code.language-mermaid, pre code.hljs.language-mermaid').forEach((block, index) => {
            const pre = block.parentElement;
            const code = block.textContent;

            // 创建 mermaid 容器
            const mermaidDiv = document.createElement('div');
            mermaidDiv.className = 'mermaid';
            mermaidDiv.id = 'mermaid-' + Date.now() + '-' + index;

            try {
                mermaid.render(mermaidDiv.id, code).then(({svg}) => {
                    mermaidDiv.innerHTML = svg;
                    pre.replaceWith(mermaidDiv);
                }).catch(err => {
                    console.error('Mermaid render error:', err);
                });
            } catch (err) {
                console.error('Mermaid error:', err);
            }
        });

        // 也检查没有语言标记的 mermaid 代码块
        container.querySelectorAll('pre code').forEach((block, index) => {
            const code = block.textContent.trim();
            if (code.startsWith('graph ') || code.startsWith('flowchart ') ||
                code.startsWith('sequenceDiagram') || code.startsWith('classDiagram') ||
                code.startsWith('stateDiagram') || code.startsWith('erDiagram') ||
                code.startsWith('gantt') || code.startsWith('pie') ||
                code.startsWith('gitGraph')) {

                const pre = block.parentElement;
                const mermaidDiv = document.createElement('div');
                mermaidDiv.className = 'mermaid';
                mermaidDiv.id = 'mermaid-auto-' + Date.now() + '-' + index;

                try {
                    mermaid.render(mermaidDiv.id, code).then(({svg}) => {
                        mermaidDiv.innerHTML = svg;
                        pre.replaceWith(mermaidDiv);
                    }).catch(err => {
                        console.error('Mermaid auto-detect render error:', err);
                    });
                } catch (err) {
                    console.error('Mermaid auto-detect error:', err);
                }
            }
        });
    }
    
    // 验证密码
    const verifyPassword = async (password) => {
        try {
            if (!noteKey) return false;
            const response = await fetch(`/${noteKey}/verify`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                },
                body: new URLSearchParams({
                    'password': password,
                    'next_url': `/${noteKey}`
                }),
                credentials: 'same-origin'
            });

            if (!response.redirected) return false;
            const finalPath = new URL(response.url).pathname;
            return finalPath === `/${noteKey}`;
        } catch (error) {
            console.error('Error:', error);
            return false;
        }
    };

    // 创建 Promise 化的密码输入函数
    const showPasswordModal = (options = {}) => {
        const { showError = false, errorText = '密码错误' } = options;
        return new Promise((resolve) => {
            const modal = document.getElementById('preview-password-modal');
            const passwordInput = document.getElementById('preview-password');
            const errorMsg = document.getElementById('preview-password-error');
            const confirmBtn = document.getElementById('confirm-preview-password');
            const cancelBtn = document.getElementById('cancel-preview-password');
            const closeBtn = modal ? modal.querySelector('.close-modal') : null;

            if (!modal || !passwordInput || !errorMsg || !confirmBtn || !cancelBtn || !closeBtn) {
                resolve(null);
                return;
            }

            // 重置状态
            passwordInput.value = '';
            if (showError) {
                errorMsg.textContent = errorText;
                errorMsg.classList.remove('hidden');
            } else {
                errorMsg.classList.add('hidden');
            }
            modal.classList.remove('hidden');
            passwordInput.focus();

            const cleanup = () => {
                modal.classList.add('hidden');
                confirmBtn.removeEventListener('click', handleConfirm);
                cancelBtn.removeEventListener('click', handleCancel);
                closeBtn.removeEventListener('click', handleCancel);
                passwordInput.removeEventListener('keypress', handleKeypress);
            };

            const handleConfirm = () => {
                const password = passwordInput.value;
                if (password) {
                    cleanup();
                    resolve(password);
                }
            };

            const handleCancel = () => {
                cleanup();
                resolve(null);
            };

            const handleKeypress = (e) => {
                if (e.key === 'Enter') {
                    handleConfirm();
                } else if (e.key === 'Escape') {
                    handleCancel();
                }
            };

            confirmBtn.addEventListener('click', handleConfirm);
            cancelBtn.addEventListener('click', handleCancel);
            closeBtn.addEventListener('click', handleCancel);
            passwordInput.addEventListener('keypress', handleKeypress);
        });
    };

    const ensurePasswordVerified = async (hasPassword) => {
        if (!hasPassword || window.authenticated) return true;

        let showError = false;
        while (true) {
            const password = await showPasswordModal({ showError });
            if (!password) return false;

            const verified = await verifyPassword(password);
            if (verified) {
                window.authenticated = true;
                return true;
            }

            showError = true;
        }
    };

    // 切换预览模式
    const togglePreviewMode = async () => {
        if (!previewButton) return;
        // 如果当前是预览模式，需要切换到编辑模式时验证密码
        // 只有在未认证的情况下才需要验证密码
        if (isPreviewMode && !window.authenticated) {
            const hasPassword = previewButton.dataset.hasPassword === 'true';
            const allowed = await ensurePasswordVerified(hasPassword);
            if (!allowed) return;
        }

        isPreviewMode = !isPreviewMode;

        if (isPreviewMode) {
            if (!isPC()) {
                editor.classList.add('hidden');
                previewDiv.classList.remove('hidden');
            } else {
                // PC模式下为容器添加preview-mode类
                document.querySelector('.editor-container').classList.add('preview-mode');
            }
            editor.setAttribute('readonly', 'readonly');
            editor.classList.add('preview-mode');
            editorContainer1.classList.add('preview-active'); // 添加水印类
            previewButton.innerHTML = '<i class="fas fa-edit"></i> 编辑';
        } else {
            if (!isPC()) {
                editor.classList.remove('hidden');
                previewDiv.classList.add('hidden');
            } else {
                // PC模式下移除容器的preview-mode类
                document.querySelector('.editor-container').classList.remove('preview-mode');
            }
            editor.removeAttribute('readonly');
            editor.classList.remove('preview-mode');
            editorContainer1.classList.remove('preview-active'); // 移除水印类
            previewButton.innerHTML = '<i class="fas fa-eye"></i> 预览';
        }

        // 更新预览内容
        updatePreview(editor.value);
    };

    // 初始化状态
    if (isViewOnly) {
        editor.setAttribute('readonly', 'readonly');
        editor.classList.add('preview-mode');
        if (!isPC()) {
            editor.classList.add('hidden');
            previewDiv.classList.remove('hidden');
        } else {
            // PC模式下为容器添加preview-mode类
            document.querySelector('.editor-container').classList.add('preview-mode');
        }
        editorContainer1.classList.add('preview-active'); // 只读模式下也显示水印
        if (previewButton) {
            previewButton.style.display = 'none'; // 只读模式下隐藏按钮
        }
    } else {
        if (!isPC()) {
            editor.classList.remove('hidden');
            previewDiv.classList.add('hidden');
        }
    }

    // 监听预览按钮点击事件
    if (previewButton) {
        previewButton.addEventListener('click', (e) => {
            e.preventDefault();
            togglePreviewMode().catch((err) => console.error('togglePreviewMode error:', err));
        });
    }

    // 监听编辑按钮点击事件 (view_only 模式)
    const editBtn = document.getElementById('edit-btn');
    if (editBtn) {
        editBtn.addEventListener('click', (e) => {
            e.preventDefault();
            (async () => {
                // view=1 页面点击“编辑”：需要则验证密码，然后跳转到编辑页（去掉 ?view=1）
                const hasPassword = editBtn.dataset.hasPassword === 'true';
                const allowed = await ensurePasswordVerified(hasPassword);
                if (!allowed) return;

                if (noteKey) {
                    window.location.href = `/${noteKey}`;
                }
            })().catch((err) => console.error('edit click error:', err));
        });
    }

    // 监听输入事件
    if (editor) {
        editor.addEventListener('input', function() {
            // 实时更新预览 (已带 300ms 防抖)
            if (!isPreviewMode) {
                updatePreview(this.value);
            }
        });

        // 初始加载时执行一次预览
        if (editor.value) {
            updatePreview(editor.value);
        }
    }

    // 获取元素
    const helpBtn = document.getElementById('help-btn');
    const helpModal = document.getElementById('helpModal');
    const closeButtons1 = helpModal.querySelectorAll('.custom-modal-close, .custom-modal-close-btn');
    
    // 打开弹框
    helpBtn.addEventListener('click', function() {
        helpModal.style.display = 'block';
        document.body.style.overflow = 'hidden'; // 防止背景滚动
    });
    
    // 关闭弹框
    closeButtons1.forEach(function(button) {
        button.addEventListener('click', function() {
            helpModal.style.display = 'none';
            document.body.style.overflow = ''; // 恢复背景滚动
        });
    });
    
    // 点击弹框外部关闭
    window.addEventListener('click', function(event) {
        if (event.target === helpModal) {
            helpModal.style.display = 'none';
            document.body.style.overflow = '';
        }
    });
    
    // ESC键关闭弹框
    document.addEventListener('keydown', function(event) {
        if (event.key === 'Escape' && helpModal.style.display === 'block') {
            helpModal.style.display = 'none';
            document.body.style.overflow = '';
        }
    });

    if (typeof renderMathInElement === 'function') {
        renderMathInElement(document.body, {
            delimiters: [
                {left: '$$', right: '$$', display: true},
                {left: '$', right: '$', display: false},
                {left: '\\[', right: '\\]', display: true},
                {left: '\\(', right: '\\)', display: false}
            ],
            throwOnError: false
        });
    }
    
    // 初始化代码高亮
    if (typeof hljs !== 'undefined' && typeof hljs.highlightElement === 'function') {
        document.querySelectorAll('pre code').forEach((block) => {
            hljs.highlightElement(block);
        });
    }

    // 删除笔记功能
    const deleteNoteBtn = document.getElementById('delete-note-btn');
    const deleteModal = document.getElementById('delete-modal');
    const cancelDeleteBtn = document.getElementById('cancel-delete');
    const confirmDeleteBtn = document.getElementById('confirm-delete');
    const deletePasswordInput = document.getElementById('delete-password');
    const deletePasswordError = document.getElementById('delete-password-error');
    const closeDeleteModalBtn = deleteModal ? deleteModal.querySelector('.close-modal') : null;

    const performDeleteNote = async () => {
        const response = await fetch(`/${noteKey}/delete`, {
            method: 'POST',
            credentials: 'same-origin'
        });

        if (response.redirected) {
            window.location.href = response.url;
            return;
        }

        if (!response.ok) {
            throw new Error('删除失败');
        }

        window.location.href = '/';
    };

    if (deleteNoteBtn) {
        deleteNoteBtn.addEventListener('click', function(e) {
            e.preventDefault();
            if (deleteModal) {
                deleteModal.classList.remove('hidden');
                if (deletePasswordInput) {
                    deletePasswordInput.value = '';
                }
                if (deletePasswordError) {
                    deletePasswordError.classList.add('hidden');
                }
            }
        });
    }

    if (cancelDeleteBtn) {
        cancelDeleteBtn.addEventListener('click', function() {
            deleteModal.classList.add('hidden');
        });
    }

    if (closeDeleteModalBtn) {
        closeDeleteModalBtn.addEventListener('click', function() {
            deleteModal.classList.add('hidden');
        });
    }

    if (confirmDeleteBtn) {
        confirmDeleteBtn.addEventListener('click', function() {
            if (window.password){
                // 如果有密码保护，验证密码
                const password = deletePasswordInput ? deletePasswordInput.value : '';
                
                fetch(`/${noteKey}/verify-delete`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({ password: password }),
                })
                .then(response => response.json())
                .then(data => {
                    if (data.success) {
                        window.authenticated = true;
                        return performDeleteNote();
                    } else {
                        // 密码错误，显示错误信息
                        if (deletePasswordError) {
                            deletePasswordError.textContent = data.message || '密码错误';
                            deletePasswordError.classList.remove('hidden');
                        }
                    }
                })
                .catch(error => {
                    console.error('Error:', error);
                });
            } else {
                performDeleteNote().catch(error => {
                    console.error('Error:', error);
                });
            }
        });
    }

    // 分享功能
    const shareBtn = document.getElementById('share-btn');
    const shareModal = document.getElementById('share-modal');
    const shareLink = document.getElementById('share-link');
    const copyLinkBtn = document.getElementById('copy-link-btn');
    const copyContentBtn = document.getElementById('copy-content-btn');
    const closeShareModalBtn = shareModal ? shareModal.querySelector('.close-modal') : null;
    if (shareBtn) {
        shareBtn.addEventListener('click', function() {
            if (shareModal) {
                shareModal.classList.remove('hidden');
            }
        });
    }

    if (closeShareModalBtn) {
        closeShareModalBtn.addEventListener('click', function() {
            shareModal.classList.add('hidden');
        });
    }

    if (copyLinkBtn) {
        copyLinkBtn.addEventListener('click', function() {
            // 直接读取后端生成的 HTTPS 链接
            var shareUrl = document.getElementById('share-link').value;

            // 复制到剪贴板
            navigator.clipboard.writeText(shareUrl).then(function() {
                // 显示复制成功提示
                const notification = document.createElement('div');
                notification.className = 'save-indicator';
                notification.textContent = '链接已复制到剪贴板！';
                document.body.appendChild(notification);

                setTimeout(() => {
                    notification.remove();
                }, 2000);
            }).catch(function() {
                // 降级方案：使用临时 input
                var tempInput = document.createElement("input");
                tempInput.value = shareUrl;
                document.body.appendChild(tempInput);
                tempInput.select();
                document.execCommand("copy");
                document.body.removeChild(tempInput);

                const notification = document.createElement('div');
                notification.className = 'save-indicator';
                notification.textContent = '链接已复制到剪贴板！';
                document.body.appendChild(notification);

                setTimeout(() => {
                    notification.remove();
                }, 2000);
            });
        });
    }

    if (copyContentBtn) {
        copyContentBtn.addEventListener('click', function() {
            const content = contentInput ? contentInput.value : (editor ? editor.value : '');
            
            // 创建临时textarea元素
            const textarea = document.createElement('textarea');
            textarea.value = content;
            textarea.style.position = 'fixed';
            textarea.style.opacity = 0;
            document.body.appendChild(textarea);
            textarea.select();
            document.execCommand('copy');
            document.body.removeChild(textarea);
            
            // 显示复制成功提示
            const notification = document.createElement('div');
            notification.className = 'save-indicator';
            notification.textContent = '笔记内容已复制到剪贴板';
            document.body.appendChild(notification);
            
            setTimeout(() => {
                notification.remove();
            }, 2000);
        });
    }

    // 点击模态框外部关闭
    window.addEventListener('click', function(event) {
        modals.forEach(modal => {
            if (event.target === modal) {
                modal.classList.add('hidden');
            }
        });
    });

    // 添加键盘事件监听器 (ESC键关闭模态框)
    document.addEventListener('keydown', function(event) {
        if (event.key === 'Escape') {
            modals.forEach(modal => {
                if (!modal.classList.contains('hidden')) {
                    modal.classList.add('hidden');
                }
            });
        }
    });
    // 点击模态框外部关闭
    window.addEventListener('click', function(event) {
        if (event.target === deleteModal) {
            deleteModal.classList.add('hidden');
        }
    });

    // 点击模态框外部关闭
    window.addEventListener('click', function(event) {
        if (event.target === securityModal) {
            securityModal.classList.add('hidden');
        }
    });

    // 点击模态框外部关闭
    window.addEventListener('click', function(event) {
        if (event.target === shareModal) {
            shareModal.classList.add('hidden');
        }
    });

    // 确保所有模态框初始状态为隐藏
    modals.forEach(modal => {
        modal.classList.add('hidden');
    });

    // 快捷指令工具栏功能
    const editorToolbar = document.getElementById('editor-toolbar');
    if (editorToolbar && editor) {
        // Markdown 快捷插入模板
        const markdownTemplates = {
            heading1: { prefix: '# ', suffix: '', placeholder: '一级标题' },
            heading2: { prefix: '## ', suffix: '', placeholder: '二级标题' },
            heading3: { prefix: '### ', suffix: '', placeholder: '三级标题' },
            bold: { prefix: '**', suffix: '**', placeholder: '粗体文本' },
            italic: { prefix: '*', suffix: '*', placeholder: '斜体文本' },
            strikethrough: { prefix: '~~', suffix: '~~', placeholder: '删除线文本' },
            highlight: { prefix: '==', suffix: '==', placeholder: '高亮文本' },
            ul: { prefix: '- ', suffix: '', placeholder: '列表项', multiline: true },
            ol: { prefix: '1. ', suffix: '', placeholder: '列表项', multiline: true },
            task: { prefix: '- [ ] ', suffix: '', placeholder: '任务项', multiline: true },
            code: { prefix: '```\n', suffix: '\n```', placeholder: '代码内容', block: true },
            quote: { prefix: '> ', suffix: '', placeholder: '引用内容', multiline: true },
            link: { prefix: '[', suffix: '](url)', placeholder: '链接文本' },
            image: { prefix: '![', suffix: '](图片地址)', placeholder: '图片描述' },
            hr: { prefix: '\n---\n', suffix: '', placeholder: '' },
            table: {
                prefix: '',
                suffix: '',
                placeholder: '',
                template: '| 列1 | 列2 | 列3 |\n| --- | --- | --- |\n| 内容 | 内容 | 内容 |'
            }
        };

        // 插入 Markdown 文本
        function insertMarkdown(action) {
            const template = markdownTemplates[action];
            if (!template) return;

            const start = editor.selectionStart;
            const end = editor.selectionEnd;
            const selectedText = editor.value.substring(start, end);
            const beforeText = editor.value.substring(0, start);
            const afterText = editor.value.substring(end);

            let insertText;
            let cursorOffset;

            if (template.template) {
                // 使用完整模板（如表格）
                insertText = template.template;
                cursorOffset = insertText.length;
            } else if (selectedText) {
                // 如果有选中文本，用选中文本替换占位符
                if (template.multiline) {
                    // 多行处理：每行添加前缀
                    const lines = selectedText.split('\n');
                    insertText = lines.map(line => template.prefix + line).join('\n') + template.suffix;
                } else {
                    insertText = template.prefix + selectedText + template.suffix;
                }
                cursorOffset = insertText.length;
            } else {
                // 没有选中文本，插入模板和占位符
                insertText = template.prefix + template.placeholder + template.suffix;
                cursorOffset = template.prefix.length + template.placeholder.length;
            }

            // 块级元素需要确保在新行
            if (template.block && start > 0 && beforeText[beforeText.length - 1] !== '\n') {
                insertText = '\n' + insertText;
            }

            editor.value = beforeText + insertText + afterText;

            // 设置光标位置
            if (selectedText) {
                editor.selectionStart = start + insertText.length;
                editor.selectionEnd = start + insertText.length;
            } else {
                // 选中占位符文本
                editor.selectionStart = start + template.prefix.length + (template.block && beforeText[beforeText.length - 1] !== '\n' ? 1 : 0);
                editor.selectionEnd = editor.selectionStart + template.placeholder.length;
            }

            editor.focus();

            // 触发 input 事件以更新预览和自动保存
            editor.dispatchEvent(new Event('input', { bubbles: true }));
        }

        // 工具栏按钮点击事件
        editorToolbar.addEventListener('click', function(e) {
            const btn = e.target.closest('.toolbar-btn');
            if (!btn) return;

            const action = btn.dataset.action;
            if (action) {
                insertMarkdown(action);
            }
        });

        // 键盘快捷键
        editor.addEventListener('keydown', function(e) {
            // Ctrl/Cmd + B: 粗体
            if ((e.ctrlKey || e.metaKey) && e.key === 'b') {
                e.preventDefault();
                insertMarkdown('bold');
            }
            // Ctrl/Cmd + I: 斜体
            if ((e.ctrlKey || e.metaKey) && e.key === 'i') {
                e.preventDefault();
                insertMarkdown('italic');
            }
            // Ctrl/Cmd + K: 链接
            if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
                e.preventDefault();
                insertMarkdown('link');
            }
            // Ctrl/Cmd + Shift + K: 代码块
            if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'K') {
                e.preventDefault();
                insertMarkdown('code');
            }
        });
    }
});
