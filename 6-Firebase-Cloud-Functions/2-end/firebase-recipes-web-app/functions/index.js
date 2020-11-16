const functions = require('firebase-functions');
const admin = require('firebase-admin');
const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
require('dotenv').config();

const FIRESTORE_RECIPE_COLLECTION = process.env.FIRESTORE_RECIPE_COLLECTION;

if (!FIRESTORE_RECIPE_COLLECTION) {
  throw {
    message:
      'environment variable not set. Please add FIRESTORE_RECIPE_COLLECTION to your .env file.',
  };
}

const FIREBASE_STORAGE_BUCKET = process.env.FIREBASE_STORAGE_BUCKET;

if (!FIREBASE_STORAGE_BUCKET) {
  throw {
    message:
      'environment variable not set. Please add FIREBASE_STORAGE_BUCKET to your .env file.',
  };
}

// SETUP FIREBASE
const serviceAccount = require('./fir-recipes-3d91c-firebase-adminsdk-wyvwz-d53a1193f0.json');
const e = require('express');

let apiFirebaseOption = functions.config().firebase;
apiFirebaseOption = {
  ...apiFirebaseOption,
  credential: admin.credential.cert(serviceAccount),
};

admin.initializeApp(apiFirebaseOption);

const firestore = admin.firestore();
const settings = { timestampsInSnapshots: true };

firestore.settings(settings);

// Firebase Admin Auth
const auth = admin.auth();

// Firebase Admin Storage
const bucket = admin.storage().bucket(FIREBASE_STORAGE_BUCKET);

const app = express();

// Installing the CORS middleware
// allows us (the server) to respond to
// requests from a different origin (URL)
// than the server.
app.use(cors({ origin: true }));

// Installing the body-parser middleware
// Allow us to read JSON from requests
app.use(bodyParser.json());

// ~~ RESTFUL CRUD WEB API ENDPOINTS ~~

// CREATE
app.post('/recipes', async (request, response) => {
  const authorizationHeader = request.headers['authorization'];

  if (!authorizationHeader) {
    response.status(401).send('Missing Authorization header');
    return;
  }

  try {
    await authorizeUser(authorizationHeader);
  } catch (error) {
    response.status(401).send(error.message);
    return;
  }

  const newRecipe = request.body;
  const missingFields = validateRecipePostPut(newRecipe);

  if (missingFields) {
    response
      .status(400)
      .send(`Recipe is not valid. Missing/invalid fields: ${missingFields}`);
    return;
  }

  const recipe = sanitizeRecipePostPut(newRecipe);

  try {
    const firestoreResponse = await firestore
      .collection(FIRESTORE_RECIPE_COLLECTION)
      .add(recipe);

    const recipeId = firestoreResponse.id;

    response.status(201).send({ id: recipeId });
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
  const orderByField = queryObject['orderByField']
    ? queryObject['orderByField']
    : '';
  const orderByDirection = queryObject['orderByDirection']
    ? queryObject['orderByDirection']
    : 'asc';
  const pageNumber = queryObject['pageNumber'] ? queryObject['pageNumber'] : '';
  const perPage = queryObject['perPage'] ? queryObject['perPage'] : '';
  const cursorId = queryObject['cursorId'] ? queryObject['cursorId'] : '';

  let isAuth = false;
  let collectionRef = firestore.collection(FIRESTORE_RECIPE_COLLECTION);

  try {
    await authorizeUser(authorizationHeader);

    isAuth = true;
  } catch (error) {
    collectionRef = collectionRef.where('isPublished', '==', true);
  }

  if (category) {
    collectionRef = collectionRef.where('category', '==', category);
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

  let collectionDocumentCount = 0;

  if (isAuth) {
    const docRef = firestore
      .collection('collectionDocumentCount')
      .doc('allRecipeDocumentsCount');
    const doc = await docRef.get();
    collectionDocumentCount = doc.data().count;
  } else {
    const docRef = firestore
      .collection('collectionDocumentCount')
      .doc('publishedRecipeDocumentsCount');
    const doc = await docRef.get();
    collectionDocumentCount = doc.data().count;
  }

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
    response.status(401).send('Missing Authorization header');
    return;
  }

  try {
    await authorizeUser(authorizationHeader);
  } catch (error) {
    response.status(401).send(error.message);
    return;
  }

  const id = request.params.id;
  const newRecipe = request.body;
  const recipe = sanitizeRecipePatch(newRecipe);

  try {
    await firestore
      .collection(FIRESTORE_RECIPE_COLLECTION)
      .doc(id)
      .set(recipe, { merge: true });

    response.status(200).send({ id });
  } catch (error) {
    response.status(400).send(error.message);
  }
});

// UPDATE replace
app.put('/recipes/:id', async (request, response) => {
  const authorizationHeader = request.headers['authorization'];

  if (!authorizationHeader) {
    response.status(401).send('Missing Authorization header');
    return;
  }

  try {
    await authorizeUser(authorizationHeader);
  } catch (error) {
    response.status(401).send(error.message);
    return;
  }

  const id = request.params.id;
  const newRecipe = request.body;
  const missingFields = validateRecipePostPut(newRecipe);

  if (missingFields) {
    response
      .status(400)
      .send(`Recipe is not valid. Missing/invalid fields: ${missingFields}`);
    return;
  }

  const recipe = sanitizeRecipePostPut(newRecipe);

  try {
    await firestore.collection(FIRESTORE_RECIPE_COLLECTION).doc(id).set(recipe);

    response.status(200).send({ id });
  } catch (error) {
    response.status(400).send(error.message);
  }
});

// DELETE
app.delete('/recipes/:id', async (request, response) => {
  const authorizationHeader = request.headers['authorization'];

  if (!authorizationHeader) {
    response.status(401).send('Missing Authorization header');
    return;
  }

  try {
    await authorizeUser(authorizationHeader);
  } catch (error) {
    response.status(401).send(error.message);
  }

  const id = request.params.id;

  try {
    await firestore.collection(FIRESTORE_RECIPE_COLLECTION).doc(id).delete();
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
  let missingFields = '';

  if (!newRecipe) {
    missingFields += 'recipe, ';

    return missingFields;
  }

  if (!newRecipe.name) {
    missingFields += 'name, ';
  }

  if (!newRecipe.category) {
    missingFields += 'category, ';
  }

  if (!newRecipe.directions) {
    missingFields += 'directions, ';
  }

  if (newRecipe.isPublished !== true && newRecipe.isPublished !== false) {
    missingFields += 'isPublished, ';
  }

  if (!newRecipe.publishDate) {
    missingFields += 'publishDate, ';
  }

  if (!newRecipe.ingredients || newRecipe.ingredients.length === 0) {
    missingFields += 'ingredients, ';
  }

  if (!newRecipe.imageUrl) {
    missingFields += 'imageUrl, ';
  }

  return missingFields;
};

const sanitizeRecipePostPut = (newRecipe) => {
  const recipe = {};

  recipe.name = newRecipe.name;
  recipe.category = newRecipe.category;
  recipe.directions = newRecipe.directions;
  recipe.publishDate = new Date(newRecipe.publishDate * 1000);
  recipe.isPublished = newRecipe.isPublished;
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
      .doc('allRecipeDocumentsCount');
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
    const recipe = snap.data();
    const imageUrl = recipe.imageUrl;

    if (imageUrl) {
      const decodedUrl = decodeURIComponent(imageUrl);
      const startIndex = decodedUrl.indexOf('/o/') + 3;
      const endIndex = decodedUrl.indexOf('?');
      const fullFilePath = decodedUrl.substring(startIndex, endIndex);
      const file = bucket.file(fullFilePath);

      console.log(`Attempting to delete: ${fullFilePath}`);

      try {
        await file.delete();
        console.log('Successfully deleted image');
      } catch (error) {
        console.log(`Failed to Delete File: ${error.message}`);
      }
    }

    const docRef = firestore
      .collection('collectionDocumentCount')
      .doc('allRecipeDocumentsCount');
    const doc = await docRef.get();

    if (doc.exists) {
      docRef.update({ count: admin.firestore.FieldValue.increment(-1) });
    } else {
      docRef.set({ count: 0 });
    }

    if (recipe.isPublished) {
      const docRef = firestore
        .collection('collectionDocumentCount')
        .doc('publishedRecipeDocumentsCount');
      const doc = await docRef.get();

      if (doc.exists) {
        docRef.update({ count: admin.firestore.FieldValue.increment(-1) });
      } else {
        docRef.set({ count: 0 });
      }
    }
  });

// CRONJOB TOOL - https://crontab.guru/
const runtimeOpts = {
  timeoutSeconds: 300,
  memory: '256MB',
};

exports.dailyCheckRecipePublishDate = functions
  .runWith(runtimeOpts)
  .pubsub.schedule('0 0 * * *') // at minute 0 (midnight) every day, server time
  .onRun(async () => {
    console.log('dailyCheckRecipePublishDate() called - time to check');

    const snapshot = await firestore
      .collection('recipes')
      .where('isPublished', '==', false)
      .get();

    snapshot.forEach(async (doc) => {
      const data = doc.data();
      const now = Date.now() / 1000;
      const isPublished = data.publishDate._seconds <= now ? true : false;

      if (isPublished) {
        console.log(`Recipe: ${data.name} is now published!`);
        firestore.collection('recipes').doc(doc.id).set(
          { isPublished },
          {
            merge: true,
          }
        );

        const publishedRecipeDocumentsCountRef = firestore
          .collection('collectionDocumentCount')
          .doc('publishedRecipeDocumentsCount');
        const publishedRecipeDocumentsCountDoc = await publishedRecipeDocumentsCountRef.get();

        if (publishedRecipeDocumentsCountDoc.exists) {
          publishedRecipeDocumentsCountRef.update({
            count: admin.firestore.FieldValue.increment(1),
          });
        } else {
          publishedRecipeDocumentsCountRef.set({ count: 1 });
        }
      }
    });
  });
