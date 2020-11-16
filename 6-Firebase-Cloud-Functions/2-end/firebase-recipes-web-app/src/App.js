import './App.scss';
import { useState, useEffect } from 'react';
import FirebaseAuthService from './FirebaseAuthService';
import FirebaseFirestoreRestService from './FirebaseFirestoreRestService';
import LoginForm from './components/LoginForm';
import AddEditRecipeForm from './components/AddEditRecipeForm';

const SECONDS_MULTIPLIER = 1000;

function App() {
  const [user, setUser] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [currentRecipe, setCurrentRecipe] = useState(null);
  const [categoryFilter, setCategoryFilter] = useState('');
  const [orderBy, setOrderBy] = useState('publishDateDesc');
  const [recipesPerPage, setRecipesPerPage] = useState(3);
  const [currentPageNumber, setCurrentPageNumber] = useState(1);
  const [isLastPage, setIsLastPage] = useState(false);
  const [totalNumberOfPages, setTotalNumberOfPages] = useState(0);
  const [recipes, setRecipes] = useState([]);

  useEffect(() => {
    setIsLoading(true);

    fetchRecipes(
      categoryFilter,
      user,
      orderBy,
      recipesPerPage,
      null,
      currentPageNumber
    )
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
  }, [categoryFilter, user, orderBy, recipesPerPage, currentPageNumber]);

  FirebaseAuthService.subscribeToAuthChanges(setUser);

  async function fetchRecipes(
    categoryFilter,
    user,
    orderBy,
    recipesPerPage,
    cursorId,
    currentPageNumber
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
      const response = await FirebaseFirestoreRestService.readDocuments({
        collection: 'recipes',
        queries: queries,
        orderByField: orderByField,
        orderByDirection: orderByDirection,
        perPage: recipesPerPage,
        cursorId: cursorId,
        pageNumber: currentPageNumber,
      });

      if (response && response.documents) {
        const totalNumberOfPages = Math.ceil(
          response.collectionDocumentCount / recipesPerPage
        );

        setTotalNumberOfPages(totalNumberOfPages);

        const query = {
          collection: 'recipes',
          queries: queries,
          orderByField: orderByField,
          orderByDirection: orderByDirection,
          perPage: recipesPerPage,
          cursorId: cursorId,
          pageNumber: currentPageNumber + 1,
        };

        const nextPageResponse = await FirebaseFirestoreRestService.readDocuments(
          query
        );

        if (
          nextPageResponse &&
          nextPageResponse.documents &&
          nextPageResponse.documents.length === 0
        ) {
          setIsLastPage(true);
        } else {
          setIsLastPage(false);
        }

        fetchedRecipes = response.documents;

        fetchedRecipes.forEach((recipe) => {
          const unixPublishDate = recipe.publishDate;
          recipe.publishDate = new Date(unixPublishDate * SECONDS_MULTIPLIER);

          return recipe;
        });

        if (fetchedRecipes.length === 0 && currentPageNumber !== 1) {
          setCurrentPageNumber(currentPageNumber - 1);
        }
      } else {
        throw { message: 'Failed to load recipes!' };
      }
    } catch (error) {
      alert(error.message);
      throw error;
    }

    return fetchedRecipes;
  }

  async function handleAddRecipe(newRecipe) {
    try {
      newRecipe.publishDate =
        newRecipe.publishDate.getTime() / SECONDS_MULTIPLIER;

      const response = await FirebaseFirestoreRestService.createDocument(
        'recipes',
        newRecipe
      );

      handleFetchRecipes();

      window.scrollTo(0, 0);
      alert(`successfully created a recipe with an ID = ${response.id}`);
    } catch (error) {
      alert(error.message);

      throw error;
    }
  }

  async function handleUpdateRecipe(updatedRecipe) {
    try {
      updatedRecipe.publishDate =
        updatedRecipe.publishDate.getTime() / SECONDS_MULTIPLIER;

      await FirebaseFirestoreRestService.updateDocument(
        'recipes',
        updatedRecipe.id,
        updatedRecipe
      );

      handleFetchRecipes();

      window.scrollTo(0, 0);
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
        await FirebaseFirestoreRestService.deleteDocument('recipes', recipeId);

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
    window.scrollTo(0, 0);
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

  async function handleFetchRecipes() {
    try {
      const fetchedRecipes = await fetchRecipes(
        categoryFilter,
        user,
        orderBy,
        recipesPerPage,
        null,
        currentPageNumber
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
                <div className="row">
                  <button
                    className={
                      currentPageNumber === 1
                        ? 'primary-button hidden'
                        : 'primary-button'
                    }
                    onClick={() => setCurrentPageNumber(currentPageNumber - 1)}
                  >
                    Previous
                  </button>
                  <div>Page {currentPageNumber}</div>
                  <button
                    className={
                      isLastPage ? 'primary-button hidden' : 'primary-button'
                    }
                    onClick={() => setCurrentPageNumber(currentPageNumber + 1)}
                  >
                    Next
                  </button>
                </div>
                <div className="row">
                  {!categoryFilter
                    ? new Array(totalNumberOfPages)
                        .fill(0)
                        .map((value, index) => {
                          return (
                            <button
                              key={index + 1}
                              onClick={() => setCurrentPageNumber(index + 1)}
                              className={
                                currentPageNumber === index + 1
                                  ? 'selected-page primary-button page-button'
                                  : 'primary-button page-button'
                              }
                            >
                              {index + 1}
                            </button>
                          );
                        })
                    : null}
                </div>
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
