let lastSaveTime = window.noteUpdatedAt;

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

// 提取标题并生成目录
function extractTOC(tokens) {
    const headings = [];
    let headingIndex = 0;

    tokens.forEach((token, idx) => {
        if (token.type === 'heading') {
            const id = generateHeadingId(token.text, headingIndex++);
            token.id = id; // 为标题添加 ID
            headings.push({
                level: token.depth,
                text: token.text,
                id: id
            });
        }
    });

    return headings;
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
        html += `<li><a href="#${heading.id}" class="toc-link toc-level-${level}">${heading.text}</a></li>`;
    });

    // 关闭所有未关闭的 ul
    for (let i = 0; i < currentLevel; i++) {
        html += '</ul>';
    }

    html += '</nav></div>';
    return html;
}

// 转换函数：将内容转换为HTML，保留非Markdown内容
function convertToHtml(content) {
    if (!content) return '';

    try {
        // 使用marked库解析Markdown
        if (typeof marked !== 'undefined') {
            // 检查是否包含 [TOC] 标记
            const hasTOC = /^\[TOC\]\s*$/m.test(content);

            // 配置marked选项
            marked.setOptions({
                breaks: true,        // 将换行符转换为<br>
                gfm: true,           // 使用GitHub风格Markdown
                sanitize: false,     // 不过滤HTML标签
                smartLists: true,    // 使用更智能的列表行为
                xhtml: false         // 不使用自闭合标签
            });

            // 使用自定义渲染器为标题添加 ID
            const renderer = new marked.Renderer();
            let headingIndex = 0;

            renderer.heading = function(text, level, raw) {
                const id = generateHeadingId(text, headingIndex++);
                return `<h${level} id="${id}">${text}</h${level}>\n`;
            };

            marked.setOptions({ renderer: renderer });

            // 如果有 TOC，先提取标题生成目录
            if (hasTOC) {
                // 解析 tokens
                const tokens = marked.lexer(content);
                const headings = extractTOC(tokens);
                const tocHtml = generateTOCHtml(headings);

                // 渲染完整内容
                headingIndex = 0; // 重置索引
                let html = marked.parser(tokens);

                // 替换 [TOC] 为目录 HTML
                html = html.replace(/<p>\[TOC\]<\/p>/g, tocHtml);

                return html;
            } else {
                return marked(content);
            }
        } else {
            // 如果marked未定义，使用简单的文本处理
            return simpleTextToHtml(content);
        }
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

function downloadNote(password = null) {
    const noteKey = window.noteKey;
    let url = `/${noteKey}/download`;
    
    if (password) {
        url += `?password=${encodeURIComponent(password)}`;
    }
    
    // 创建一个隐藏的a标签并触发下载
    const a = document.createElement('a');
    a.style.display = 'none';
    a.href = url;
    a.download = `${noteKey}.txt`;
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

    // 检查是否存在标题
    const checkAndCreateFloatingTOC = () => {
        const preview = document.getElementById('preview');
        if (!preview) return;

        const headings = preview.querySelectorAll('h1, h2, h3, h4, h5, h6');
        
        if (headings.length > 0) {
            document.body.classList.add('has-headings');
            createFloatingTOC(headings);
        } else {
            document.body.classList.remove('has-headings');
            removeFloatingTOC();
        }
    };

    // 创建漂浮目录
    const createFloatingTOC = (headings) => {
        // 移除旧的漂浮目录
        removeFloatingTOC();

        // 创建漂浮目录容器
        const floatingTOC = document.createElement('div');
        floatingTOC.className = 'floating-toc show';
        floatingTOC.id = 'floating-toc';

        // 创建标题栏
        const header = document.createElement('div');
        header.className = 'floating-toc-header';
        header.innerHTML = `
            <div class="floating-toc-title">📑 目录</div>
            <div class="floating-toc-toggle">📖</div>
            <button class="toc-close-btn" title="收起目录">✕</button>
        `;

        // 创建内容区域
        const content = document.createElement('div');
        content.className = 'floating-toc-content';

        // 生成目录列表
        const nav = document.createElement('nav');
        nav.className = 'toc';

        let html = '';
        let currentLevel = 0;

        headings.forEach((heading, index) => {
            const level = parseInt(heading.tagName.substring(1));
            const text = heading.textContent;
            const id = heading.id;

            // 处理层级变化
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
            html += `<li><a href="#${id}" class="toc-link toc-level-${level}" data-heading-id="${id}">${text}</a></li>`;
        });

        // 关闭所有未关闭的 ul
        for (let i = 0; i < currentLevel; i++) {
            html += '</ul>';
        }

        nav.innerHTML = html;
        content.appendChild(nav);

        floatingTOC.appendChild(header);
        floatingTOC.appendChild(content);
        document.body.appendChild(floatingTOC);

        // 获取关闭按钮和切换按钮
        const closeBtn = floatingTOC.querySelector('.toc-close-btn');
        const toggleBtn = floatingTOC.querySelector('.floating-toc-toggle');

        // 关闭按钮点击事件（收起目录）
        closeBtn.addEventListener('click', (e) => {
            e.stopPropagation(); // 阻止事件冒泡到 header
            floatingTOC.classList.add('collapsed');
        });

        // 切换按钮点击事件（展开目录）
        toggleBtn.addEventListener('click', (e) => {
            if (floatingTOC.classList.contains('collapsed')) {
                e.stopPropagation();
                floatingTOC.classList.remove('collapsed');
            }
        });

        // 标题栏点击事件（仅在收起状态时展开）
        header.addEventListener('click', () => {
            if (floatingTOC.classList.contains('collapsed')) {
                floatingTOC.classList.remove('collapsed');
            }
        });

        // 添加目录链接点击事件（平滑滚动）
        const tocLinks = floatingTOC.querySelectorAll('.toc-link');
        tocLinks.forEach(link => {
            link.addEventListener('click', (e) => {
                e.preventDefault();
                const targetId = link.getAttribute('href').substring(1);
                const targetElement = document.getElementById(targetId);
                
                if (targetElement) {
                    // 高亮当前激活的目录项
                    tocLinks.forEach(l => l.classList.remove('active'));
                    link.classList.add('active');

                    // 平滑滚动到目标位置
                    targetElement.scrollIntoView({ 
                        behavior: 'smooth', 
                        block: 'start' 
                    });
                }
            });
        });

        // 滚动监听，自动高亮当前章节
        let ticking = false;
        const onScroll = () => {
            if (!ticking) {
                window.requestAnimationFrame(() => {
                    updateActiveTOCLink(headings, tocLinks);
                    ticking = false;
                });
                ticking = true;
            }
        };

        window.addEventListener('scroll', onScroll);
    };

    // 更新激活的目录链接
    const updateActiveTOCLink = (headings, tocLinks) => {
        const scrollPos = window.scrollY + 100;
        
        let activeIndex = -1;
        headings.forEach((heading, index) => {
            if (heading.offsetTop <= scrollPos) {
                activeIndex = index;
            }
        });

        tocLinks.forEach((link, index) => {
            if (index === activeIndex) {
                link.classList.add('active');
            } else {
                link.classList.remove('active');
            }
        });
    };

    // 移除漂浮目录
    const removeFloatingTOC = () => {
        const existing = document.getElementById('floating-toc');
        if (existing) {
            existing.remove();
        }
    };

    // 初始化
    checkAndCreateFloatingTOC();

    // 监听预览内容变化
    const preview = document.getElementById('preview');
    if (preview) {
        const observer = new MutationObserver(() => {
            checkAndCreateFloatingTOC();
        });

        observer.observe(preview, {
            childList: true,
            subtree: true
        });
    }
}

// 页面加载完成后初始化漂浮目录
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initFloatingTOC);
} else {
    initFloatingTOC();
}
