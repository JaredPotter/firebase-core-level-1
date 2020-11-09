const functions = require('firebase-functions');
const admin = require('firebase-admin');
const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
require('dotenv').config();

// SETUP FIREBASE
const serviceAccount = require('./fir-recipes-3d91c-firebase-adminsdk-wyvwz-d53a1193f0.json');

let apiFirebaseOption = functions.config().firebase;
apiFirebaseOption = {
    ...apiFirebaseOption,
    credential: admin.credential.cert(serviceAccount),
    databaseURL: process.env.FIREBASE_DATABASE_URL,
    authDomain: process.env.FIREBASE_AUTH_DOMAIN,
    storageBucket: process.env.FIREBASE_STORAGE_BUCKET,
};

admin.initializeApp(apiFirebaseOption);

const firestore = admin.firestore();
const settings = { timestampsInSnapshots: true };

firestore.settings(settings);

const auth = admin.auth();

// For example's sake - How to use Firebase Storage w/ firebase-admin
// const storage = admin.storage();
// OR ?
// const storage = admin.storage().bucket();

const app = express();

// Installing the CORS middleware
// allows us (the server) to respond to
// requests from a different origin (URL)
// than the server.
app.use(cors());

// Installing the body-parser middleware
// Allow us to read JSON from requests
app.use(bodyParser.json());

const FIRESTORE_RECIPE_COLLECTION = process.env.FIRESTORE_RECIPE_COLLECTION;

// ~~ RESTFUL CRUD WEB API ENDPOINTS ~~

// CREATE
app.post('/recipes', async (request, response) => {
    const authorizationHeader = request.headers['authorization'];

    if (!authorizationHeader) {
        response.status(401).send('Missing/Incorrect Authorization header');
        return;
    }

    try {
        await authorizeUser(authorizationHeader);
    } catch (error) {
        response.status(401).send(error.message);
    }

    const newRecipe = request.body;
    const isValid = validateRecipePostPut(newRecipe);

    if (!isValid) {
        response
            .status(400)
            .send('Recipe is not valid. Missing/invalid fields.');
        return;
    }

    const recipe = sanitizeRecipePostPut(newRecipe);

    try {
        const firestoreResponse = await firestore
            .collection(FIRESTORE_RECIPE_COLLECTION)
            .add(recipe);

        const recipeId = firestoreResponse.id;

        response.status(201).send(recipeId);
    } catch (error) {
        response.status(400).send(error.message);
        return;
    }
});

// READ all
app.get('/recipes', async (request, response) => {
    const authorizationHeader = request.headers['authorization'];
    const queryObject = request.query;
    const category = queryObject['category'] ? queryObject['category'] : '';
    const serves = queryObject['serves'] ? queryObject['serves'] : '';
    const orderByField = queryObject['orderByField']
        ? queryObject['orderByField']
        : '';
    const orderByDirection = queryObject['orderByDirection']
        ? queryObject['orderByDirection']
        : 'asc';
    const pageNumber = queryObject['pageNumber']
        ? queryObject['pageNumber']
        : '';
    const perPage = queryObject['perPage'] ? queryObject['perPage'] : '';
    const cursorId = queryObject['cursorId'] ? queryObject['cursorId'] : '';

    let collectionRef = firestore.collection(FIRESTORE_RECIPE_COLLECTION);

    try {
        await authorizeUser(authorizationHeader);
    } catch (error) {
        collectionRef = collectionRef.where('isPublished', '==', true);
    }

    if (category) {
        collectionRef = collectionRef.where('category', '==', category);
    }

    if (serves) {
        collectionRef = collectionRef.where('serves', '==', Number(serves));
    }

    if (orderByField) {
        collectionRef = collectionRef.orderBy(orderByField, orderByDirection);
    }

    if (perPage) {
        collectionRef = collectionRef.limit(Number(perPage));
    }

    if (pageNumber > 0 && perPage) {
        const pageNumberMultiplier = pageNumber - 1;
        const offset = pageNumberMultiplier * perPage;
        collectionRef = collectionRef.offset(offset);
    } else if (cursorId) {
        try {
            const documentSnapshot = await firestore
                .collection(FIRESTORE_RECIPE_COLLECTION)
                .doc(cursorId)
                .get();
            collectionRef = collectionRef.startAfter(documentSnapshot);
        } catch (error) {
            response.status(400).send(error.message);
            return;
        }
    }

    const docRef = firestore
        .collection('collectionDocumentCount')
        .doc('recipes');
    const doc = await docRef.get();
    const collectionDocumentCount = doc.data().count;

    try {
        const firestoreResponse = await collectionRef.get();

        const fetchedRecipes = firestoreResponse.docs.map((recipe) => {
            const id = recipe.id;
            const data = recipe.data();
            data.publishDate = data.publishDate._seconds;

            return { ...data, id };
        });
        const payload = {
            collectionDocumentCount,
            documents: fetchedRecipes,
        };

        response.status(200).send(payload);
    } catch (error) {
        response.status(400).send(error.message);
    }
});

// READ one
app.get('/recipes/:id', async (request, response) => {
    const id = request.params.id;

    try {
        const documentSnapshot = await firestore
            .collection(FIRESTORE_RECIPE_COLLECTION)
            .doc(id)
            .get();

        if (documentSnapshot.exists) {
            const recipeData = documentSnapshot.data();

            recipeData.publishDate = recipeData.publishDate._seconds;

            const recipe = { ...recipeData, id };
            response.status(200).send(recipe);
        } else {
            response.status(404).send('Document does not exist');
        }
    } catch (error) {
        response.status(400).send(error.message);
    }
});

// UPDATE patch
app.patch('/recipes/:id', async (request, response) => {
    const authorizationHeader = request.headers['authorization'];

    if (!authorizationHeader) {
        response.status(401).send('Missing/Incorrect Authorization header');
        return;
    }

    try {
        await authorizeUser(authorizationHeader);
    } catch (error) {
        response.status(401).send(error.message);
    }

    const id = request.params.id;
    const newRecipe = request.body;
    const recipe = sanitizeRecipePatch(newRecipe);

    try {
        await firestore
            .collection(FIRESTORE_RECIPE_COLLECTION)
            .doc(id)
            .set(recipe, { merge: true });

        response.status(200).send();
    } catch (error) {
        response.status(400).send(error.message);
    }
});

// UPDATE replace
app.put('/recipes/:id', async (request, response) => {
    const authorizationHeader = request.headers['authorization'];

    if (!authorizationHeader) {
        response.status(401).send('Missing/Incorrect Authorization header');
        return;
    }

    try {
        await authorizeUser(authorizationHeader);
    } catch (error) {
        response.status(401).send(error.message);
    }

    const id = request.params.id;
    const newRecipe = request.body;
    const isValid = validateRecipePostPut(newRecipe);

    if (!isValid) {
        response
            .status(400)
            .send('Recipe is not valid. Missing/invalid fields.');
        return;
    }

    const recipe = sanitizeRecipePostPut(newRecipe);

    try {
        await firestore
            .collection(FIRESTORE_RECIPE_COLLECTION)
            .doc(id)
            .set(recipe);

        response.status(200).send();
    } catch (error) {
        response.status(400).send(error.message);
    }
});

// DELETE
app.delete('/recipes/:id', async (request, response) => {
    const authorizationHeader = request.headers['authorization'];

    if (!authorizationHeader) {
        response.status(401).send('Missing/Incorrect Authorization header');
        return;
    }

    try {
        await authorizeUser(authorizationHeader);
    } catch (error) {
        response.status(401).send(error.message);
    }

    const id = request.params.id;

    try {
        await firestore
            .collection(FIRESTORE_RECIPE_COLLECTION)
            .doc(id)
            .delete();
        response.status(200).send();
    } catch (error) {
        response.status(400).send(error.message);
    }
});

exports.api = functions.https.onRequest(app);

console.log('🚀🚀🚀 SERVER STARTED 🚀🚀🚀');

// UTILITY FUNCTIONS

const authorizeUser = async (authorizationHeader) => {
    if (!authorizationHeader) {
        throw 'no authorization provided';
    }

    const token = authorizationHeader.split(' ')[1];

    try {
        const decodedToken = await auth.verifyIdToken(token);

        return decodedToken;
    } catch (error) {
        throw error;
    }
};

const validateRecipePostPut = (newRecipe) => {
    if (
        !newRecipe ||
        !newRecipe.name ||
        !newRecipe.category ||
        !newRecipe.description ||
        !newRecipe.serves ||
        !newRecipe.prepTime ||
        !newRecipe.cookTime ||
        !newRecipe.totalTime ||
        !newRecipe.directions ||
        !newRecipe.publishDate ||
        newRecipe.ingredients.length === 0 ||
        !newRecipe.imageUrl
    ) {
        return false;
    }

    return true;
};

const sanitizeRecipePostPut = (newRecipe) => {
    const recipe = {};

    recipe.name = newRecipe.name;
    recipe.category = newRecipe.category;
    recipe.description = newRecipe.description;
    recipe.serves = newRecipe.serves;
    recipe.prepTime = newRecipe.prepTime;
    recipe.cookTime = newRecipe.cookTime;
    recipe.totalTime = newRecipe.totalTime;
    recipe.directions = newRecipe.directions;
    recipe.publishDate = new Date(newRecipe.publishDate * 1000);
    recipe.ingredients = newRecipe.ingredients;
    recipe.imageUrl = newRecipe.imageUrl;

    return recipe;
};

const sanitizeRecipePatch = (newRecipe) => {
    const recipe = {};

    if (newRecipe.name) {
        recipe.name = newRecipe.name;
    }

    if (newRecipe.category) {
        recipe.category = newRecipe.category;
    }

    if (newRecipe.description) {
        recipe.description = newRecipe.description;
    }

    if (newRecipe.serves) {
        recipe.serves = newRecipe.serves;
    }

    if (newRecipe.prepTime) {
        recipe.prepTime = newRecipe.prepTime;
    }

    if (newRecipe.cookTime) {
        recipe.cookTime = newRecipe.cookTime;
    }

    if (newRecipe.totalTime) {
        recipe.totalTime = newRecipe.totalTime;
    }

    if (newRecipe.directions) {
        recipe.directions = newRecipe.directions;
    }

    if (newRecipe.publishDate) {
        recipe.publishDate = new Date(newRecipe.publishDate * 1000);
    }

    if (newRecipe.ingredients && newRecipe.ingredients.length > 0) {
        recipe.ingredients = newRecipe.ingredients;
    }

    if (newRecipe.imageUrl) {
        recipe.imageUrl = newRecipe.imageUrl;
    }

    return recipe;
};

exports.onCreateRecipe = functions.firestore
    .document('recipes/{recipeId}')
    .onCreate(async (snap, context) => {
        const docRef = firestore
            .collection('collectionDocumentCount')
            .doc('recipes');
        const doc = await docRef.get();

        if (doc.exists) {
            docRef.update({ count: admin.firestore.FieldValue.increment(1) });
        } else {
            docRef.set({ count: 1 });
        }
    });

exports.onDeleteRecipe = functions.firestore
    .document('recipes/{recipeId}')
    .onDelete(async (snap, context) => {
        const docRef = firestore
            .collection('collectionDocumentCount')
            .doc('recipes');
        const doc = await docRef.get();

        if (doc.exists) {
            docRef.update({ count: admin.firestore.FieldValue.increment(-1) });
        } else {
            docRef.set({ count: 0 });
        }
    });

// CRONJOB TOOL - https://crontab.guru/
const runtimeOpts = {
    timeoutSeconds: 300,
    memory: '256MB',
};

exports.dailyCheckRecipePublishDate = functions
    .runWith(runtimeOpts)
    .pubsub.schedule('0 0 * * *') // At midnight server time
    .onRun(async () => {
        console.log('dailyCheckRecipePublishDate() called - time to check');

        const snapshot = await firestore
            .collection('recipes')
            .where('isPublished', '==', false)
            .get();

        snapshot.forEach((doc) => {
            const data = doc.data();
            const now = Date.now() / 1000;
            const isPublished = data.publishDate._seconds <= now ? true : false;

            if (isPublished) {
                console.log(`Recipe: ${data.name} is now published!`);
            }

            firestore.collection('recipes').doc(doc.id).set(
                { isPublished },
                {
                    merge: true,
                }
            );
        });
    });