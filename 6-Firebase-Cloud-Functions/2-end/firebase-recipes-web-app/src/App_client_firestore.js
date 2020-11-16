import './App.scss';
import { useState, useEffect } from 'react';
import FirebaseAuthService from './FirebaseAuthService';
import FirebaseFirestoreService from './FirebaseFirestoreService';
import LoginForm from './components/LoginForm';
import AddEditRecipeForm from './components/AddEditRecipeForm';
import FirebaseStorageService from './FirebaseStorageService';

function App() {
  const [user, setUser] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [currentRecipe, setCurrentRecipe] = useState(null);
  const [categoryFilter, setCategoryFilter] = useState('');
  const [orderBy, setOrderBy] = useState('publishDateDesc');
  const [recipesPerPage, setRecipesPerPage] = useState(3);
  const [recipes, setRecipes] = useState([]);

  useEffect(() => {
    setIsLoading(true);

    fetchRecipes(categoryFilter, user, orderBy, recipesPerPage)
      .then((fetchedRecipes) => {
        setRecipes(fetchedRecipes);
      })
      .catch((error) => {
        alert(error.message);
        throw error;
      })
      .finally(() => {
        setIsLoading(false);
      });
  }, [categoryFilter, user, orderBy, recipesPerPage]);

  FirebaseAuthService.subscribeToAuthChanges(setUser);

  async function fetchRecipes(
    categoryFilter,
    user,
    orderBy,
    recipesPerPage,
    cursorId
  ) {
    const queries = [];

    if (categoryFilter) {
      queries.push({
        field: 'category',
        condition: '==',
        value: categoryFilter,
      });
    }

    if (!user) {
      queries.push({
        field: 'isPublished',
        condition: '==',
        value: true,
      });
    }

    let orderByField;
    let orderByDirection;

    if (orderBy) {
      switch (orderBy) {
        case 'publishDateAsc':
          orderByField = 'publishDate';
          orderByDirection = 'asc';
          break;
        case 'publishDateDesc':
          orderByField = 'publishDate';
          orderByDirection = 'desc';
          break;
        default:
          break;
      }
    }

    let fetchedRecipes = [];

    try {
      const parameters = {
        collection: 'recipes',
        queries: queries,
        orderByField: orderByField,
        orderByDirection: orderByDirection,
        perPage: recipesPerPage,
        cursorId: cursorId,
      };
      const response = await FirebaseFirestoreService.readDocuments(parameters);
      fetchedRecipes = response.docs.map((recipe) => {
        const id = recipe.id;

        const data = recipe.data();
        const unixPublishDate = data.publishDate.seconds;
        data.publishDate = new Date(unixPublishDate * 1000);

        return { ...data, id };
      });
    } catch (error) {
      alert(error.message);
    }

    return fetchedRecipes;
  }

  async function handleAddRecipe(newRecipe) {
    try {
      const response = await FirebaseFirestoreService.createDocument(
        'recipes',
        newRecipe
      );

      handleFetchRecipes();

      alert(`successfully created a recipe with an ID = ${response.id}`);
    } catch (error) {
      alert(error.message);

      throw error;
    }
  }

  async function handleUpdateRecipe(updatedRecipe) {
    try {
      await FirebaseFirestoreService.updateDocument(
        'recipes',
        updatedRecipe.id,
        updatedRecipe
      );

      handleFetchRecipes();

      alert(`successfully updated recipe with an ID = ${updatedRecipe.id}`);

      setCurrentRecipe(null);
    } catch (error) {
      alert(error.message);

      throw error;
    }
  }

  async function handleDeleteRecipe(recipeId) {
    const deleteConfirmation = window.confirm(
      'Are you sure you want to delete this recipe?'
    );

    if (deleteConfirmation) {
      try {
        await FirebaseFirestoreService.deleteDocument('recipes', recipeId);

        const recipe = recipes.find((recipe) => {
          return recipe.id === recipeId;
        });

        if (recipe && recipe.imageUrl) {
          try {
            await FirebaseStorageService.deleteFile(recipe.imageUrl);
          } catch (error) {
            alert(error.message);
            throw error;
          }
        }

        handleFetchRecipes();
        setCurrentRecipe(null);

        alert(`successfully deleted recipe with an ID = ${recipeId}`);
      } catch (error) {
        alert(error.message);

        throw error;
      }
    }
  }

  function handleCancelClick() {
    setCurrentRecipe(null);
  }

  function handleRecipeEditClick(recipeId) {
    const selectedRecipe = recipes.find((recipe) => {
      return recipe.id === recipeId;
    });

    if (selectedRecipe) {
      setCurrentRecipe(selectedRecipe);
      window.scrollTo(0, document.body.scrollHeight);
    }
  }

  function handleRecipesPerPageChange(e) {
    const recipesPerPage = e.target.value;

    setRecipes([]);
    setRecipesPerPage(recipesPerPage);
  }

  async function handleLoadMoreRecipesClick() {
    const lastRecipe = recipes[recipes.length - 1];
    const cursorId = lastRecipe.id;

    try {
      const fetchedRecipes = await fetchRecipes(
        categoryFilter,
        user,
        orderBy,
        recipesPerPage,
        cursorId
      );
      const newRecipes = [...recipes, ...fetchedRecipes];

      setRecipes(newRecipes);
    } catch (error) {
      alert(error.message);
    }
  }

  async function handleFetchRecipes() {
    try {
      const fetchedRecipes = await fetchRecipes(
        categoryFilter,
        user,
        orderBy,
        recipesPerPage
      );

      setRecipes(fetchedRecipes);
    } catch (error) {
      alert(error.message);
    }
  }

  function lookupCategoryLabel(categoryKey) {
    const categories = {
      breadsSandwichesPizza: 'Breads, Sandwiches, and Pizza',
      eggsBreakfast: 'Eggs & Breakfast',
      dessertsBakedGoods: 'Desserts & Baked Goods',
      fishSeafood: 'Fish & Seafood',
      vegetables: 'Vegetables',
    };

    return categories[categoryKey];
  }

  function formatDate(date) {
    let dd = date.getUTCDate();
    let mm = date.getUTCMonth() + 1;
    const yyyy = date.getFullYear();

    if (dd < 10) {
      dd = '0' + dd;
    }

    if (mm < 10) {
      mm = '0' + mm;
    }

    return `${mm}-${dd}-${yyyy}`;
  }

  return (
    <div className="app">
      <div className="title-row">
        <h1 className="title">Firebase Recipes</h1>
        <LoginForm existingUser={user} />
      </div>
      <div className="main">
        <div className="row apart filters">
          <label className="input-label">
            Category:
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className="select"
            >
              <option value=""></option>
              <option value="breadsSandwichesPizza">
                Breads, Sandwiches, and Pizza
              </option>
              <option value="eggsBreakfast">Eggs & Breakfast</option>
              <option value="dessertsBakedGoods">Desserts & Baked Goods</option>
              <option value="fishSeafood">Fish & Seafood</option>
              <option value="vegetables">Vegetables</option>
            </select>
          </label>
          <label className="input-label">
            Order By:
            <select
              value={orderBy}
              onChange={(e) => setOrderBy(e.target.value)}
              className="select"
            >
              <option value=""></option>
              <option value="publishDateDesc">
                Publish Date (newest - oldest)
              </option>
              <option value="publishDateAsc">
                Publish Date (oldest - newest)
              </option>
            </select>
          </label>
        </div>
        <div className="center">
          <div className="recipe-list-box">
            {isLoading ? (
              <div className="fire">
                <div className="flames">
                  <div className="flame"></div>
                  <div className="flame"></div>
                  <div className="flame"></div>
                  <div className="flame"></div>
                </div>
                <div className="logs"></div>
              </div>
            ) : null}
            {!isLoading && recipes && recipes.length === 0 ? (
              <h5 className="no-recipes">No Recipes Found</h5>
            ) : null}
            {isLoading || (recipes && recipes.length > 0) ? (
              <>
                <div className="recipe-list">
                  {recipes && recipes.length > 0
                    ? recipes.map((recipe) => {
                        return (
                          <div className="recipe-card" key={recipe.id}>
                            <div>
                              <div>Name: {recipe.name}</div>
                              <div className="recipe-image-box">
                                <img
                                  src={recipe.imageUrl}
                                  alt={recipe.name}
                                  className="recipe-image"
                                />
                              </div>
                              <div>
                                Category: {lookupCategoryLabel(recipe.category)}
                              </div>
                              <div>
                                Publish Date: {formatDate(recipe.publishDate)}
                              </div>
                            </div>
                            {user ? (
                              <button
                                onClick={() => handleRecipeEditClick(recipe.id)}
                                className="primary-button edit-button"
                              >
                                EDIT
                              </button>
                            ) : null}
                          </div>
                        );
                      })
                    : null}
                </div>
              </>
            ) : null}
          </div>
          {isLoading || (recipes && recipes.length > 0) ? (
            <>
              <label className="input-label">
                Recipes Per Page:
                <select
                  value={recipesPerPage}
                  onChange={handleRecipesPerPageChange}
                  className="select"
                >
                  <option value="3">3</option>
                  <option value="6">6</option>
                </select>
              </label>
              <div className="pagination">
                <button
                  onClick={handleLoadMoreRecipesClick}
                  className="primary-button"
                >
                  LOAD MORE RECIPES
                </button>
              </div>
            </>
          ) : null}
        </div>
        {user ? (
          <AddEditRecipeForm
            handleAddRecipe={handleAddRecipe}
            handleUpdateRecipe={handleUpdateRecipe}
            handleDeleteRecipe={handleDeleteRecipe}
            existingRecipe={currentRecipe}
            handleCancelClick={handleCancelClick}
          />
        ) : null}
      </div>
    </div>
  );
}

export default App;
