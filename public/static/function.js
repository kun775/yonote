function initializeNoteGlobals() {
    const dataset = document.body ? document.body.dataset : {};
    window.authenticated = dataset.authenticated === 'true';
    window.noteUpdatedAt = Number(dataset.noteUpdatedAt || 0);
    window.noteKey = dataset.noteKey || '';
    window.viewOnly = dataset.viewOnly === 'true';
    window.password = dataset.password === 'true';
    window.public = dataset.public === 'true';
    window.noteDirty = false;
}

initializeNoteGlobals();

let lastSaveTime = window.noteUpdatedAt;

function escapeHtml(text) {
    return String(text || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

// sanitizeUrl 按协议白名单过滤链接 / 图片地址，返回可直接放进属性的转义值，不允许时返回空串
//
// 无协议的相对地址（docs/a.md、../x、#锚点、/path）放行；有协议的只允许 http(s)、mailto、tel，
// 图片额外允许 base64 data:image。判断协议前先去掉空白与控制字符，防止 "java\tscript:" 绕过。
function sanitizeUrl(url, allowDataImage = false) {
    const value = String(url || '').trim();
    if (!value) return '';

    const compact = value.replace(/[\u0000- \u007f]/g, '');
    const scheme = compact.match(/^([a-z][a-z0-9+.-]*):/i);
    if (!scheme) {
        return escapeHtml(value);
    }

    if (['http', 'https', 'mailto', 'tel'].includes(scheme[1].toLowerCase())) {
        return escapeHtml(value);
    }

    if (allowDataImage && /^data:image\/[a-z0-9.+-]+;base64,/i.test(compact)) {
        return escapeHtml(value);
    }

    return '';
}

// 生成唯一的标题 ID
function generateHeadingId(text, index) {
    // 移除特殊字符，转换为小写，替换空格为连字符
    const id = text
        .toLowerCase()
        .replace(/[^\w\s\u4e00-\u9fa5-]/g, '')
        .replace(/\s+/g, '-')
        .substring(0, 50); // 限制长度
    return id ? `${id}-${index}` : `heading-${index}`;
}

// 生成目录 HTML
function generateTOCHtml(headings) {
    if (headings.length === 0) return '';

    let html = '<div class="toc-container"><div class="toc-title">目录</div><nav class="toc">';
    let currentLevel = 0;

    headings.forEach((heading, index) => {
        const level = heading.level;

        // 处理层级变化
        if (level > currentLevel) {
            // 深入层级
            for (let i = currentLevel; i < level; i++) {
                html += '<ul>';
            }
        } else if (level < currentLevel) {
            // 回退层级
            for (let i = level; i < currentLevel; i++) {
                html += '</ul>';
            }
        }

        currentLevel = level;

        // 添加目录项
        html += `<li><a href="#${heading.id}" class="toc-link toc-level-${level}">${escapeHtml(heading.text)}</a></li>`;
    });

    // 关闭所有未关闭的 ul
    for (let i = 0; i < currentLevel; i++) {
        html += '</ul>';
    }

    html += '</nav></div>';
    return html;
}

function stripMarkdownForHeading(text) {
    return String(text || '')
        .replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '$1')
        .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '$1')
        .replace(/[`*_~]/g, '')
        .trim();
}

// ---------------------------------------------------------------------------
// Markdown 渲染：基于 marked（CommonMark + GFM，见 public/static/vendor/），在其上扩展
//   - [TOC] 目录、==高亮==、标题锚点 id（与悬浮目录共用 generateHeadingId）
//   - 数学公式保护：$...$、$$...$$、\(...\)、\[...\] 原样包进 .math-inline / .math-block，
//     避免公式里的 _ * \ 被当成 Markdown 语法吃掉；app.js 只对这些元素调用 KaTeX，
//     普通文本里的 $（如金额）不会被误渲染成公式
//   - 链接 / 图片地址白名单（sanitizeUrl），外链新窗口打开
//
// 安全约束：输出写入 DOM 前必须再经 DOMPurify 净化；
// allowHtml 为 false 时（净化器未加载）原始 HTML 一律按文本转义，保证失败时是「安全地降级」。
// ---------------------------------------------------------------------------

let markdownRenderState = { headings: [], allowHtml: false };
let markdownInstance = null;

// 行内公式：\(...\)、段内的 \[...\] 与 $$...$$（KaTeX 按块级显示）、$...$。
// $...$ 要求定界符内侧不贴空白、结尾 $ 后不跟数字，避免把「$5 和 $10」这类金额误判为公式
function tokenizeInlineMath(src) {
    const match = /^\\\(([\s\S]+?)\\\)/.exec(src)
        || /^\\\[([\s\S]+?)\\\]/.exec(src)
        || /^\$\$(?!\$)([\s\S]+?)\$\$/.exec(src)
        || /^\$(?!\$)((?:\\.|[^\\$\n])+?)\$(?!\d)/.exec(src);
    if (!match) return undefined;

    const body = match[1];
    if (match[0].startsWith('$') && !match[0].startsWith('$$') && /^\s|\s$/.test(body)) {
        return undefined;
    }
    return { type: 'mathInline', raw: match[0], text: match[0] };
}

const markdownExtensions = [
    {
        name: 'toc',
        level: 'block',
        start(src) {
            const index = src.search(/^ {0,3}\[TOC\][ \t]*$/im);
            return index < 0 ? undefined : index;
        },
        tokenizer(src) {
            const match = /^ {0,3}\[TOC\][ \t]*(?:\n+|$)/i.exec(src);
            return match ? { type: 'toc', raw: match[0] } : undefined;
        },
        renderer() {
            return generateTOCHtml(markdownRenderState.headings);
        }
    },
    {
        name: 'mathBlock',
        level: 'block',
        start(src) {
            const index = src.search(/^ {0,3}(?:\$\$|\\\[)/m);
            return index < 0 ? undefined : index;
        },
        tokenizer(src) {
            // 公式体内不允许再出现结束定界符，避免懒惰匹配跨过多个公式
            const match = /^ {0,3}(\$\$(?:(?!\$\$)[\s\S])+?\$\$|\\\[(?:(?!\\\])[\s\S])+?\\\])[ \t]*(?:\n+|$)/.exec(src);
            return match ? { type: 'mathBlock', raw: match[0], text: match[1] } : undefined;
        },
        renderer(token) {
            return `<div class="math-block">${escapeHtml(token.text)}</div>\n`;
        }
    },
    {
        name: 'mathInline',
        level: 'inline',
        start(src) {
            const index = src.search(/\$|\\[([]/);
            return index < 0 ? undefined : index;
        },
        tokenizer: tokenizeInlineMath,
        renderer(token) {
            return `<span class="math-inline">${escapeHtml(token.text)}</span>`;
        }
    },
    {
        name: 'mark',
        level: 'inline',
        start(src) {
            const index = src.indexOf('==');
            return index < 0 ? undefined : index;
        },
        tokenizer(src) {
            const match = /^==(?=\S)([^\n]*?\S)==/.exec(src);
            if (!match) return undefined;
            return { type: 'mark', raw: match[0], tokens: this.lexer.inlineTokens(match[1]) };
        },
        renderer(token) {
            return `<mark>${this.parser.parseInline(token.tokens)}</mark>`;
        }
    }
];

const markdownRenderer = {
    heading(token) {
        const id = token.yonoteId ? ` id="${escapeHtml(token.yonoteId)}"` : '';
        return `<h${token.depth}${id}>${this.parser.parseInline(token.tokens)}</h${token.depth}>\n`;
    },
    link(token) {
        const text = this.parser.parseInline(token.tokens);
        const href = sanitizeUrl(token.href);
        if (!href) return text;

        const title = token.title ? ` title="${escapeHtml(token.title)}"` : '';
        const external = /^(?:https?:)?\/\//i.test(token.href);
        const target = external ? ' target="_blank" rel="noopener noreferrer"' : '';
        return `<a href="${href}"${title}${target}>${text}</a>`;
    },
    image(token) {
        const src = sanitizeUrl(token.href, true);
        if (!src) return escapeHtml(token.text);

        const title = token.title ? ` title="${escapeHtml(token.title)}"` : '';
        return `<img src="${src}" alt="${escapeHtml(token.text)}"${title} loading="lazy" />`;
    },
    html(token) {
        return markdownRenderState.allowHtml ? token.text : escapeHtml(token.text);
    },
    listitem(item) {
        const body = this.parser.parse(item.tokens);
        return item.task ? `<li class="task-list-item">${body}</li>\n` : `<li>${body}</li>\n`;
    }
};

function getMarkdownInstance() {
    if (markdownInstance) return markdownInstance;
    if (typeof marked === 'undefined' || typeof marked.Marked !== 'function') return null;

    markdownInstance = new marked.Marked({ gfm: true, breaks: true });
    markdownInstance.use({ extensions: markdownExtensions, renderer: markdownRenderer });
    return markdownInstance;
}

// 按文档顺序收集所有标题（含引用、列表内的标题），并把锚点 id 写回 token 供渲染使用
function assignHeadingIds(tokens) {
    const headings = [];
    const visit = (list) => {
        list.forEach((token) => {
            if (token.type === 'heading') {
                const text = stripMarkdownForHeading(token.text) || '未命名标题';
                token.yonoteId = generateHeadingId(text, headings.length);
                headings.push({ level: token.depth, text, id: token.yonoteId });
            }
            if (Array.isArray(token.tokens) && token.type !== 'heading') visit(token.tokens);
            if (Array.isArray(token.items)) visit(token.items);
        });
    };
    visit(tokens);
    return headings;
}

// 转换函数：将 Markdown 转换为 HTML（写入 DOM 前仍需 DOMPurify 净化）
//
// 参数:
//   - content string: Markdown 原文
//   - options.allowHtml boolean: 是否保留原始 HTML；仅在随后会经过 DOMPurify 时传 true
function convertToHtml(content, options = {}) {
    if (!content) return '';

    const instance = getMarkdownInstance();
    if (!instance) {
        return simpleTextToHtml(content);
    }

    try {
        const tokens = instance.lexer(String(content).replace(/\r\n?/g, '\n'));
        markdownRenderState = {
            headings: assignHeadingIds(tokens),
            allowHtml: options.allowHtml === true
        };
        return instance.parser(tokens);
    } catch (e) {
        console.error('Markdown转换错误:', e);
        return simpleTextToHtml(content);
    } finally {
        markdownRenderState = { headings: [], allowHtml: false };
    }
}

function isPC() {
    const userAgent = navigator.userAgent.toLowerCase();
    return /windows|macintosh|linux/.test(userAgent);
}

// 简单文本转HTML函数
function simpleTextToHtml(text) {
    // 转义HTML特殊字符并保留换行
    return text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;')
        .replace(/\n/g, '<br>');
}

// 添加防抖函数来限制请求频率
function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}
// 自动调整文本区域高度
function adjustTextareaHeight() {
    const textarea = document.getElementById('content');
    if (textarea) {
        textarea.style.height = 'auto';
        textarea.style.height = (window.innerHeight - 100) + 'px';
    }
    
    const previewContainer = document.getElementById('preview');
    if (previewContainer) {
        // previewContainer.style.height = (window.innerHeight - 100) + 'px';
        previewContainer.style.overflowY = 'auto';
    }
    
    const contentDisplay = document.querySelector('.content-display');
    if (contentDisplay) {
        contentDisplay.style.height = (window.innerHeight - 100) + 'px';
        contentDisplay.style.overflowY = 'auto';
    }
}

// 前端计算时间差，减少服务器请求
function updateTimeAgo() {
    const lastUpdatedElement = document.getElementById('last-updated'); // 获取 lastUpdatedElement 的引用
    if (!lastUpdatedElement) return;
    
    const now = Math.floor(Date.now() / 1000);
    const secondsAgo = now - lastSaveTime;
    let timeAgoText = '';
    if (secondsAgo < 60) {
        timeAgoText = `${secondsAgo}秒前`;
    } else if (secondsAgo < 3600) {
        timeAgoText = `${Math.floor(secondsAgo / 60)}分钟前`;
    } else if (secondsAgo < 86400) {
        timeAgoText = `${Math.floor(secondsAgo / 3600)}小时前`;
    } else if (secondsAgo < 604800) {
        timeAgoText = `${Math.floor(secondsAgo / 86400)}天前`;
    } else {
        const date = new Date(lastSaveTime * 1000);
        timeAgoText = date.toLocaleDateString() + ' ' + date.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
    }
    
    lastUpdatedElement.textContent = `最后更新：${timeAgoText}`;
}

function updatePublicOption() {
    const publicCheckbox = document.getElementById('public-checkbox'); // 获取publicCheckbox的引用
    const hasPassword = document.querySelector('input[name="password_action"][value="keep"]:checked') && 
                        window.password ||
                        document.querySelector('input[name="password_action"][value="change"]:checked');
    
    if (publicCheckbox) {
        publicCheckbox.disabled = !hasPassword;
        
        const publicOptionContainer = document.getElementById('public-option-container'); // 获取publicOptionContainer的引用
        if (publicOptionContainer) {
            if (hasPassword) {
                publicOptionContainer.style.opacity = '1';
            } else {
                publicOptionContainer.style.opacity = '0.5';
                publicCheckbox.checked = false;
            }
        }
    }
}

function buildProtectedNoteRedirectUrl(noteKey, isPublic) {
    const encodedKey = encodeURIComponent(noteKey);
    return isPublic ? `/${encodedKey}?view=1` : `/${encodedKey}`;
}

function applyRemoteNoteContent(note) {
    if (!note || typeof note.content !== 'string') return;
    if (!Number.isFinite(note.updatedAt) || note.updatedAt <= lastSaveTime) return;
    if (window.noteDirty) return;

    const contentElement = document.getElementById('content');
    if (!contentElement || contentElement.value === note.content) {
        lastSaveTime = note.updatedAt;
        window.noteUpdatedAt = note.updatedAt;
        updateTimeAgo();
        return;
    }

    contentElement.value = note.content;

    const settingsContentInput = document.getElementById('settings-content-input');
    if (settingsContentInput) {
        settingsContentInput.value = note.content;
    }

    lastSaveTime = note.updatedAt;
    window.noteUpdatedAt = note.updatedAt;
    updateTimeAgo();
    document.dispatchEvent(new CustomEvent('yonote:content-updated', {
        detail: { content: note.content }
    }));
}

// checkNoteProtectionStatus 检查 note 是否已被外部接口设置为受保护状态
//
// 参数: 无
//
// 元数据:
//   - 作者: VitaHuang
//   - 创建时间: 2026-05-08
//   - 更新时间: 2026-05-08
//   - 更新内容: 初始化已打开页面的 note 保护状态同步逻辑。
async function checkNoteProtectionStatus() {
    if (!window.noteKey) return;

    try {
        const response = await fetch(`/api/notes/${encodeURIComponent(window.noteKey)}`, {
            headers: {
                'Accept': 'application/json'
            },
            cache: 'no-store',
            credentials: 'same-origin'
        });

        if (response.status === 403) {
            window.password = true;
            window.public = false;
            if (!window.authenticated) {
                window.location.href = buildProtectedNoteRedirectUrl(window.noteKey, false);
            }
            return;
        }

        if (!response.ok) return;

        const data = await response.json();
        const note = data && data.note;
        if (!note) return;

        applyRemoteNoteContent(note);

        if (!note.hasPassword) return;

        window.password = true;
        window.public = Boolean(note.public);

        if (!window.authenticated && (!window.viewOnly || !note.public)) {
            window.location.href = buildProtectedNoteRedirectUrl(window.noteKey, Boolean(note.public));
            return;
        }
    } catch (error) {
        console.warn('检查笔记保护状态失败:', error);
    }
}

async function downloadNote(options = {}) {
    const normalized = typeof options === 'object' && options !== null
        ? options
        : { password: options };

    const noteKey = window.noteKey;
    const format = normalized.format === 'pdf' ? 'pdf' : 'txt';
    const filename = `${noteKey}.${format}`;
    let url = `/${noteKey}/download?format=${encodeURIComponent(format)}`;

    const a = document.createElement('a');
    a.style.display = 'none';
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
}

function autoSave() {
    const content = document.getElementById('content').value;
    
    fetch(`/${window.noteKey}/auto-save`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ content }),
    })
    .then(response => {
        if (response.status === 403) {
            window.password = true;
            window.authenticated = false;

            if (typeof window.promptNotePasswordVerification === 'function') {
                window.promptNotePasswordVerification();
            } else if (typeof checkNoteProtectionStatus === 'function') {
                checkNoteProtectionStatus();
            }
            throw new Error('权限已变更，请重新验证');
        }
        if (!response.ok) {
            throw new Error('保存失败');
        }
        return response.json();
    })
    .then(data => {
        console.log('自动保存成功:', data);
        // 更新最后保存时间
        lastSaveTime = data.timestamp;
        window.noteUpdatedAt = data.timestamp;
        window.noteDirty = false;
        updateTimeAgo();
        
        // 可以添加一个小提示，表示已保存
        // const saveIndicator = document.createElement('div');
        // saveIndicator.className = 'save-indicator';
        // saveIndicator.textContent = '已保存';
        // document.body.appendChild(saveIndicator);
        
        // setTimeout(() => {
        //     saveIndicator.remove();
        // }, 2000);
    })
    .catch(error => {
        console.error('自动保存失败:', error);
        const errorIndicator = document.createElement('div');
        errorIndicator.className = 'save-indicator error';
        errorIndicator.textContent = '保存失败';
        document.body.appendChild(errorIndicator);
        
        setTimeout(() => {
            errorIndicator.remove();
        }, 2000);
    });
}
// ==================== 漂浮目录功能 ====================

function initFloatingTOC() {
    // 只在 PC 端启用
    if (!isPC()) return;
    const preview = document.getElementById('preview');
    if (!preview) return;

    const stateKey = `yonote:toc-state:${window.noteKey || window.location.pathname}`;
    const validStates = new Set(['expanded', 'collapsed', 'hidden']);
    let tocState = localStorage.getItem(stateKey);
    if (!validStates.has(tocState)) tocState = 'expanded';

    let lastSignature = '';
    let rafId = 0;
    let currentScrollHandler = null;

    const persistState = (nextState) => {
        tocState = nextState;
        localStorage.setItem(stateKey, nextState);
    };

    const cleanupScrollHandler = () => {
        if (currentScrollHandler) {
            window.removeEventListener('scroll', currentScrollHandler);
            currentScrollHandler = null;
        }
    };

    const removeFloatingTOC = () => {
        const existing = document.getElementById('floating-toc');
        if (existing) {
            existing.remove();
        }
        cleanupScrollHandler();
    };

    const removeTOCLauncher = () => {
        const launcher = document.getElementById('toc-launcher');
        if (launcher) {
            launcher.remove();
        }
    };

    const buildSignature = (headingElements) => {
        return Array.from(headingElements)
            .map((heading) => `${heading.tagName}:${heading.id || ''}:${(heading.textContent || '').trim()}`)
            .join('|');
    };

    const updateActiveTOCLink = (headingElements, tocLinks) => {
        const scrollPos = window.scrollY + 100;
        let activeIndex = -1;

        headingElements.forEach((heading, index) => {
            if (heading.offsetTop <= scrollPos) {
                activeIndex = index;
            }
        });

        tocLinks.forEach((link, index) => {
            link.classList.toggle('active', index === activeIndex);
        });
    };

    const createTOCLauncher = () => {
        if (document.getElementById('toc-launcher')) return;

        const launcher = document.createElement('button');
        launcher.id = 'toc-launcher';
        launcher.type = 'button';
        launcher.className = 'toc-launcher';
        launcher.setAttribute('aria-label', '打开目录');
        launcher.innerHTML = '<i class="fas fa-list-ul"></i><span>目录</span>';
        launcher.addEventListener('click', () => {
            persistState('expanded');
            checkAndCreateFloatingTOC(true);
        });

        document.body.appendChild(launcher);
    };

    const applyToggleIcon = (toggleBtn, isCollapsed) => {
        if (isCollapsed) {
            toggleBtn.innerHTML = '<i class="fas fa-angle-left"></i>';
            toggleBtn.title = '展开目录';
            toggleBtn.setAttribute('aria-label', '展开目录');
        } else {
            toggleBtn.innerHTML = '<i class="fas fa-angle-right"></i>';
            toggleBtn.title = '收起目录';
            toggleBtn.setAttribute('aria-label', '收起目录');
        }
    };

    const createFloatingTOC = (headingElements) => {
        removeFloatingTOC();
        removeTOCLauncher();

        if (tocState === 'hidden') {
            createTOCLauncher();
            return;
        }

        const floatingTOC = document.createElement('aside');
        floatingTOC.className = `floating-toc show${tocState === 'collapsed' ? ' collapsed' : ''}`;
        floatingTOC.id = 'floating-toc';

        const header = document.createElement('div');
        header.className = 'floating-toc-header';
        header.innerHTML = `
            <div class="floating-toc-title"><i class="fas fa-list-ul"></i><span>目录</span></div>
            <div class="floating-toc-actions">
                <button type="button" class="toc-icon-btn toc-toggle-btn"></button>
                <button type="button" class="toc-icon-btn toc-hide-btn" title="关闭目录" aria-label="关闭目录">
                    <i class="fas fa-times"></i>
                </button>
            </div>
        `;

        const content = document.createElement('div');
        content.className = 'floating-toc-content';

        const nav = document.createElement('nav');
        nav.className = 'toc';

        let html = '';
        let currentLevel = 0;
        let headingIndex = 0;

        headingElements.forEach((heading) => {
            const level = parseInt(heading.tagName.substring(1), 10);
            const text = (heading.textContent || '').trim();
            if (!heading.id) {
                heading.id = generateHeadingId(text, headingIndex);
            }
            headingIndex += 1;

            if (level > currentLevel) {
                for (let i = currentLevel; i < level; i++) {
                    html += '<ul>';
                }
            } else if (level < currentLevel) {
                for (let i = level; i < currentLevel; i++) {
                    html += '</ul>';
                }
            }

            currentLevel = level;
            // 标题文本来自用户内容（textContent 已是解码后的文本），拼进 innerHTML 前必须转义
            const safeId = escapeHtml(heading.id);
            html += `<li><a href="#${safeId}" class="toc-link toc-level-${level}" data-heading-id="${safeId}">${escapeHtml(text)}</a></li>`;
        });

        for (let i = 0; i < currentLevel; i++) {
            html += '</ul>';
        }

        nav.innerHTML = html;
        content.appendChild(nav);
        floatingTOC.appendChild(header);
        floatingTOC.appendChild(content);
        document.body.appendChild(floatingTOC);

        const toggleBtn = floatingTOC.querySelector('.toc-toggle-btn');
        const hideBtn = floatingTOC.querySelector('.toc-hide-btn');
        const tocLinks = floatingTOC.querySelectorAll('.toc-link');

        applyToggleIcon(toggleBtn, floatingTOC.classList.contains('collapsed'));

        toggleBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            const willCollapse = !floatingTOC.classList.contains('collapsed');
            floatingTOC.classList.toggle('collapsed', willCollapse);
            persistState(willCollapse ? 'collapsed' : 'expanded');
            applyToggleIcon(toggleBtn, willCollapse);
        });

        hideBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            persistState('hidden');
            removeFloatingTOC();
            createTOCLauncher();
        });

        tocLinks.forEach((link) => {
            link.addEventListener('click', (e) => {
                e.preventDefault();
                const targetId = link.getAttribute('href').substring(1);
                const targetElement = document.getElementById(targetId);
                if (!targetElement) return;

                tocLinks.forEach((tocLink) => tocLink.classList.remove('active'));
                link.classList.add('active');
                targetElement.scrollIntoView({
                    behavior: 'smooth',
                    block: 'start'
                });
            });
        });

        let ticking = false;
        currentScrollHandler = () => {
            if (ticking) return;
            ticking = true;
            window.requestAnimationFrame(() => {
                updateActiveTOCLink(headingElements, tocLinks);
                ticking = false;
            });
        };
        window.addEventListener('scroll', currentScrollHandler);
    };

    const checkAndCreateFloatingTOC = (force = false) => {
        const headingElements = preview.querySelectorAll('h1, h2, h3, h4, h5, h6');
        if (headingElements.length === 0) {
            document.body.classList.remove('has-headings');
            lastSignature = '';
            removeFloatingTOC();
            removeTOCLauncher();
            return;
        }

        document.body.classList.add('has-headings');
        const nextSignature = buildSignature(headingElements);
        if (!force && nextSignature === lastSignature) {
            return;
        }

        lastSignature = nextSignature;
        createFloatingTOC(headingElements);
    };

    checkAndCreateFloatingTOC(true);

    const observer = new MutationObserver(() => {
        if (rafId) {
            window.cancelAnimationFrame(rafId);
        }
        rafId = window.requestAnimationFrame(() => {
            checkAndCreateFloatingTOC(false);
        });
    });

    observer.observe(preview, {
        childList: true,
        subtree: true,
        characterData: true
    });
}

// 页面加载完成后初始化漂浮目录
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initFloatingTOC);
} else {
    initFloatingTOC();
}

