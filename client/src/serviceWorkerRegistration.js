export function register() {
    if (process.env.NODE_ENV !== 'production') {
        console.log('SW: пропускаємо реєстрацію в dev-режимі');
        return;
    }
    if (!('serviceWorker' in navigator)) {
        console.warn('SW: не підтримується цим браузером');
        return;
    }

    window.addEventListener('load', () => {
        const swUrl = `${process.env.PUBLIC_URL}/service-worker.js`;
        navigator.serviceWorker
            .register(swUrl)
            .then((registration) => {
                console.log('✅ SW зареєстровано:', registration.scope);
            })
            .catch((error) => {
                console.error('❌ SW помилка:', error);
            });
    });
}

export function unregister() {
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.ready
            .then((registration) => registration.unregister())
            .catch((error) => console.error(error));
    }
}