import axios from "axios";

const httpClient = axios.create({
    headers: {
        "Content-Type": "application/json"
    }
});

httpClient.interceptors.response.use(
    (response) => {
        return response;
    },
    (error) => {
        console.log('error response', error)
        if (error.response.status === 401) {
            window.location.href = '/#/logout';
        };
        return Promise.reject(error);
    }
);

export default httpClient;
