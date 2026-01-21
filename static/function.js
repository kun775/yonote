let lastSaveTime = window.noteUpdatedAt;
// 转换函数：将内容转换为HTML，保留非Markdown内容
function convertToHtml(content) {
    if (!content) return '';
    
    try {
        // 使用marked库解析Markdown
        if (typeof marked !== 'undefined') {
            // 配置marked选项
            marked.setOptions({
                breaks: true,        // 将换行符转换为<br>
                gfm: true,           // 使用GitHub风格Markdown
                sanitize: false,     // 不过滤HTML标签
                smartLists: true,    // 使用更智能的列表行为
                xhtml: false         // 不使用自闭合标签
            });
            
            return marked(content);
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