document.addEventListener('DOMContentLoaded', () => {
    const deleteEmptyButton = document.querySelector('[data-delete-empty-notes="true"]');
    if (deleteEmptyButton) {
        deleteEmptyButton.addEventListener('click', async () => {
            if (!confirm('确定要删除所有空笔记吗？此操作不可恢复！')) {
                return;
            }

            try {
                const response = await fetch('/admin/notes-empty', {
                    method: 'DELETE',
                    credentials: 'same-origin'
                });
                const data = await response.json();
                if (data.success) {
                    alert('成功删除 ' + data.deleted + ' 条空笔记');
                    location.reload();
                    return;
                }
                alert('删除失败');
            } catch (error) {
                alert('删除失败: ' + error.message);
            }
        });
    }

    document.querySelectorAll('[data-delete-note-key]').forEach((button) => {
        button.addEventListener('click', async () => {
            const key = button.dataset.deleteNoteKey;
            const redirect = button.dataset.deleteRedirect || 'reload';
            if (!key) return;

            if (!confirm(`确定删除笔记 ${key}？此操作不可撤销！`)) {
                return;
            }

            await fetch(`/admin/notes/${encodeURIComponent(key)}`, {
                method: 'DELETE',
                credentials: 'same-origin'
            });

            if (redirect === 'reload') {
                location.reload();
            } else {
                location.href = redirect;
            }
        });
    });
});
