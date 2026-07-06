document.addEventListener('DOMContentLoaded', async () => {
    // Load existing config if any
    const config = await window.electronAPI.getConfig();
    if (config.gasUrl) document.getElementById('gasUrl').value = config.gasUrl;
    if (config.dept) document.getElementById('dept').value = config.dept;
    if (config.name) document.getElementById('name').value = config.name;

    document.getElementById('btnSave').addEventListener('click', async () => {
        const gasUrl = document.getElementById('gasUrl').value.trim();
        const dept = document.getElementById('dept').value;
        const name = document.getElementById('name').value.trim();

        if (!gasUrl || !name) {
            alert('모든 필드를 입력해주세요.');
            return;
        }

        const newConfig = { gasUrl, dept, name };
        await window.electronAPI.saveConfig(newConfig);
        
        document.getElementById('msg').innerText = '저장되었습니다. 창이 닫히고 백그라운드 모니터링이 시작됩니다.';
        // window should be hidden by main process via IPC
    });
});
