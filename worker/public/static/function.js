let lastSaveTime = window.noteUpdatedAt;

function escapeHtml(text) {
    return String(text || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function sanitizeUrl(url, allowDataImage = false) {
    const value = String(url || '').trim();
    if (!value) return '';

    if (/^(https?:|mailto:|tel:|\/|\.\/|\.\.\/|#)/i.test(value)) {
        return escapeHtml(value);
    }

    if (allowDataImage && /^data:image\/[a-zA-Z0-9.+-]+;base64,/i.test(value)) {
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

function normalizeMarkdownLines(content) {
    return String(content || '')
        .replace(/\r\n/g, '\n')
        .replace(/\r/g, '\n')
        .split('\n');
}

function collectHeadings(content) {
    const lines = normalizeMarkdownLines(content);
    const headings = [];
    let headingIndex = 0;
    let fence = null;

    lines.forEach((line) => {
        const trimmed = line.trim();
        const fenceMatch = trimmed.match(/^(```|~~~)/);

        if (fence) {
            if (fenceMatch && fenceMatch[1] === fence) {
                fence = null;
            }
            return;
        }

        if (fenceMatch) {
            fence = fenceMatch[1];
            return;
        }

        const match = line.match(/^\s{0,3}(#{1,6})\s+(.+?)\s*#*\s*$/);
        if (!match) return;

        const text = stripMarkdownForHeading(match[2]);
        headings.push({
            level: match[1].length,
            text: text || '未命名标题',
            id: generateHeadingId(text || 'heading', headingIndex++)
        });
    });

    return headings;
}

function splitTableRow(line) {
    let body = line.trim();
    if (body.startsWith('|')) body = body.slice(1);
    if (body.endsWith('|')) body = body.slice(0, -1);
    return body.split('|').map((cell) => cell.trim());
}

function isTableSeparator(line) {
    const cells = splitTableRow(line);
    return cells.length >= 2 && cells.every((cell) => /^:?-{3,}:?$/.test(cell));
}

function renderInlineMarkdown(text) {
    const placeholders = [];
    const reserve = (html) => {
        const token = `%%INLINE-TOKEN-${placeholders.length}%%`;
        placeholders.push({ token, html });
        return token;
    };

    let output = escapeHtml(text);

    output = output.replace(/`([^`]+)`/g, (_, code) => reserve(`<code>${escapeHtml(code)}</code>`));
    output = output.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (_, alt, url) => {
        const safeUrl = sanitizeUrl(url, true);
        if (!safeUrl) {
            return escapeHtml(_);
        }
        return reserve(`<img src="${safeUrl}" alt="${escapeHtml(alt)}" loading="lazy" />`);
    });
    output = output.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, label, url) => {
        const safeUrl = sanitizeUrl(url);
        if (!safeUrl) {
            return escapeHtml(_);
        }
        const isExternal = /^(https?:)?\/\//i.test(url);
        const target = isExternal ? ' target="_blank" rel="noopener noreferrer"' : '';
        return reserve(`<a href="${safeUrl}"${target}>${escapeHtml(label)}</a>`);
    });
    output = output.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    output = output.replace(/__([^_]+)__/g, '<strong>$1</strong>');
    output = output.replace(/~~([^~]+)~~/g, '<del>$1</del>');
    output = output.replace(/\*([^*\n]+)\*/g, '<em>$1</em>');
    output = output.replace(/_([^_\n]+)_/g, '<em>$1</em>');
    output = output.replace(/==([^=\n]+)==/g, '<mark>$1</mark>');

    placeholders.forEach(({ token, html }) => {
        output = output.replace(token, html);
    });

    return output;
}

function renderList(lines, startIndex, ordered) {
    const tagName = ordered ? 'ol' : 'ul';
    const items = [];
    let index = startIndex;

    while (index < lines.length) {
        const line = lines[index];
        const match = ordered
            ? line.match(/^\s*\d+\.\s+(.*)$/)
            : line.match(/^\s*[-*+]\s+(.*)$/);

        if (!match) break;

        const taskMatch = match[1].match(/^\[( |x|X)\]\s+(.*)$/);
        if (taskMatch) {
            const checked = taskMatch[1].toLowerCase() === 'x';
            items.push(`<li class="task-list-item"><input type="checkbox" disabled${checked ? ' checked' : ''} /> <span>${renderInlineMarkdown(taskMatch[2])}</span></li>`);
        } else {
            items.push(`<li>${renderInlineMarkdown(match[1])}</li>`);
        }

        index += 1;
    }

    return {
        html: `<${tagName}>${items.join('')}</${tagName}>`,
        nextIndex: index
    };
}

function renderBlockquote(lines, startIndex) {
    const quoteLines = [];
    let index = startIndex;

    while (index < lines.length) {
        const match = lines[index].match(/^\s*>\s?(.*)$/);
        if (!match) break;
        quoteLines.push(renderInlineMarkdown(match[1]));
        index += 1;
    }

    return {
        html: `<blockquote><p>${quoteLines.join('<br>')}</p></blockquote>`,
        nextIndex: index
    };
}

function renderCodeBlock(lines, startIndex) {
    const firstLine = lines[startIndex].trim();
    const fence = firstLine.startsWith('```') ? '```' : '~~~';
    const language = firstLine.slice(3).trim();
    const codeLines = [];
    let index = startIndex + 1;

    while (index < lines.length) {
        const line = lines[index];
        if (line.trim().startsWith(fence)) {
            index += 1;
            break;
        }
        codeLines.push(line);
        index += 1;
    }

    const className = language ? ` class="language-${escapeHtml(language)}"` : '';
    return {
        html: `<pre><code${className}>${escapeHtml(codeLines.join('\n'))}</code></pre>`,
        nextIndex: index
    };
}

function renderTable(lines, startIndex) {
    const headers = splitTableRow(lines[startIndex]);
    const rows = [];
    let index = startIndex + 2;

    while (index < lines.length) {
        const line = lines[index];
        if (!line.trim() || !line.includes('|')) break;
        rows.push(splitTableRow(line));
        index += 1;
    }

    const thead = `<thead><tr>${headers.map((cell) => `<th>${renderInlineMarkdown(cell)}</th>`).join('')}</tr></thead>`;
    const tbody = rows.length > 0
        ? `<tbody>${rows.map((row) => `<tr>${row.map((cell) => `<td>${renderInlineMarkdown(cell)}</td>`).join('')}</tr>`).join('')}</tbody>`
        : '';

    return {
        html: `<table>${thead}${tbody}</table>`,
        nextIndex: index
    };
}

function renderParagraph(lines, startIndex) {
    const parts = [];
    let index = startIndex;

    while (index < lines.length) {
        const line = lines[index];
        const trimmed = line.trim();

        if (
            !trimmed
            || /^\s{0,3}(#{1,6})\s+/.test(line)
            || /^\s*>\s?/.test(line)
            || /^\s*([-*_])(?:\s*\1){2,}\s*$/.test(trimmed)
            || /^\s*(```|~~~)/.test(trimmed)
            || /^\s*\[TOC\]\s*$/i.test(trimmed)
            || /^\s*\d+\.\s+/.test(line)
            || /^\s*[-*+]\s+/.test(line)
            || (line.includes('|') && index + 1 < lines.length && isTableSeparator(lines[index + 1]))
        ) {
            break;
        }

        parts.push(renderInlineMarkdown(line));
        index += 1;
    }

    return {
        html: `<p>${parts.join('<br>')}</p>`,
        nextIndex: index
    };
}

// 转换函数：将 Markdown 转换为安全 HTML
function convertToHtml(content) {
    if (!content) return '';

    try {
        const lines = normalizeMarkdownLines(content);
        const headings = collectHeadings(content);
        const html = [];
        let index = 0;
        let headingIndex = 0;

        while (index < lines.length) {
            const line = lines[index];
            const trimmed = line.trim();

            if (!trimmed) {
                index += 1;
                continue;
            }

            if (/^\s*\[TOC\]\s*$/i.test(trimmed)) {
                html.push(generateTOCHtml(headings));
                index += 1;
                continue;
            }

            const codeFenceMatch = trimmed.match(/^(```|~~~)/);
            if (codeFenceMatch) {
                const renderedCode = renderCodeBlock(lines, index);
                html.push(renderedCode.html);
                index = renderedCode.nextIndex;
                continue;
            }

            const headingMatch = line.match(/^\s{0,3}(#{1,6})\s+(.+?)\s*#*\s*$/);
            if (headingMatch) {
                const text = stripMarkdownForHeading(headingMatch[2]) || '未命名标题';
                const heading = headings[headingIndex];
                const id = heading ? heading.id : generateHeadingId(text, headingIndex);
                headingIndex += 1;
                html.push(`<h${headingMatch[1].length} id="${id}">${renderInlineMarkdown(headingMatch[2])}</h${headingMatch[1].length}>`);
                index += 1;
                continue;
            }

            if (/^\s*([-*_])(?:\s*\1){2,}\s*$/.test(trimmed)) {
                html.push('<hr />');
                index += 1;
                continue;
            }

            if (line.includes('|') && index + 1 < lines.length && isTableSeparator(lines[index + 1])) {
                const renderedTable = renderTable(lines, index);
                html.push(renderedTable.html);
                index = renderedTable.nextIndex;
                continue;
            }

            if (/^\s*>\s?/.test(line)) {
                const renderedQuote = renderBlockquote(lines, index);
                html.push(renderedQuote.html);
                index = renderedQuote.nextIndex;
                continue;
            }

            if (/^\s*\d+\.\s+/.test(line)) {
                const renderedOrderedList = renderList(lines, index, true);
                html.push(renderedOrderedList.html);
                index = renderedOrderedList.nextIndex;
                continue;
            }

            if (/^\s*[-*+]\s+/.test(line)) {
                const renderedUnorderedList = renderList(lines, index, false);
                html.push(renderedUnorderedList.html);
                index = renderedUnorderedList.nextIndex;
                continue;
            }

            const renderedParagraph = renderParagraph(lines, index);
            html.push(renderedParagraph.html);
            index = renderedParagraph.nextIndex;
        }

        return html.join('\n');
    } catch (e) {
        console.error('Markdown转换错误:', e);
        return simpleTextToHtml(content);
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
        if (!response.ok) {
            throw new Error('保存失败');
        }
        return response.json();
    })
    .then(data => {
        console.log('自动保存成功:', data);
        // 更新最后保存时间
        lastSaveTime = data.timestamp;
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
            html += `<li><a href="#${heading.id}" class="toc-link toc-level-${level}" data-heading-id="${heading.id}">${text}</a></li>`;
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

