const App = {
    getGasUrl: () => {
        return localStorage.getItem('gasUrl');
    },

    setGasUrl: (url) => {
        localStorage.setItem('gasUrl', url);
    },

    showMessage: (msg, className) => {
        const statusEl = document.getElementById('statusMessage');
        if (statusEl) {
            statusEl.className = 'text-center mt-4 ' + className;
            statusEl.innerText = msg;
        }
    },

    initApp: () => {
        const urlParams = new URLSearchParams(window.location.search);
        const urlGas = urlParams.get('gasUrl');
        if (urlGas) {
            App.setGasUrl(urlGas);
            // remove it from url cleanly
            window.history.replaceState({}, document.title, window.location.pathname);
        }
    },

    apiCall: async (data) => {
        const url = App.getGasUrl();
        if (!url) {
            console.error("GAS URL is not set.");
            return null;
        }

        try {
            // Because of CORS and GAS nuances, using POST with JSON string body
            const response = await fetch(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'text/plain;charset=utf-8',
                },
                body: JSON.stringify(data)
            });
            const result = await response.json();
            return result;
        } catch (error) {
            console.error("API Call Error:", error);
            // Sometimes GAS CORS on POST is tricky without no-cors. 
            // Alternatively, fallback to GET if POST fails or use URL params.
            // But GAS supports POST if redirect is followed. 
            // In web environments, standard fetch to GAS Web App works if doGet/doPost return ContentService.
            return null;
        }
    },
    
    logout: () => {
        sessionStorage.removeItem('user');
        sessionStorage.removeItem('isAdmin');
        window.location.href = 'index.html';
    }
};

window.App = App;
