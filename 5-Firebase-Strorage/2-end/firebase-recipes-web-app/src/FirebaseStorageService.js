import firebase from 'firebase';

const config = {
    apiKey: process.env.REACT_APP_FIREBASE_API_KEY,
    authDomain: process.env.REACT_APP_FIREBASE_AUTH_DOMAIN,
    databaseURL: process.env.REACT_APP_FIREBASE_DATABASE_URL,
    projectId: process.env.REACT_APP_FIREBASE_PROJECT_ID,
    storageBucket: process.env.REACT_APP_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: process.env.REACT_APP_FIREBASE_MESSAGING_SENDER_ID,
    appId: process.env.REACT_APP_FIREBASE_APP_ID,
};

if (!firebase.apps.length) {
    firebase.initializeApp(config);
}

const storageRef = firebase.storage().ref();

const uploadFile = (file, fullFilePath, progressCallback, UrlCallback) => {
    const uploadTask = storageRef.child(fullFilePath).put(file);

    uploadTask.on(
        'state_changed',
        (snapshot) => {
            const progress = Math.round(
                (snapshot.bytesTransferred / snapshot.totalBytes) * 100
            );

            progressCallback(progress);
        },
        (error) => {
            throw error;
        }
    );

    return uploadTask.then(async () => {
        const downloadUrl = await uploadTask.snapshot.ref.getDownloadURL();

        return downloadUrl;
    });
};

const deleteFile = (fileDownloadUrl) => {
    const decodedUrl = decodeURIComponent(fileDownloadUrl);
    const startIndex = decodedUrl.indexOf('/o/') + 3;
    const endIndex = decodedUrl.indexOf('?');
    const filePath = decodedUrl.substring(startIndex, endIndex);

    return storageRef.child(filePath).delete();
};

const FirebaseStorageService = {
    uploadFile,
    deleteFile,
};

export default FirebaseStorageService;
