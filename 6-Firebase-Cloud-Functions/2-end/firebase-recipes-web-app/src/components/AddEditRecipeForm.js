import FirebaseStorageService from '../FirebaseStorageService';
import React from 'react';
import { v4 as uuidv4 } from 'uuid';

function AddEditRecipeForm({
  handleAddRecipe,
  handleUpdateRecipe,
  handleDeleteRecipe,
  existingRecipe,
  handleCancelClick,
}) {
  React.useEffect(() => {
    if (existingRecipe) {
      setName(existingRecipe.name);
      setCategory(existingRecipe.category);
      setPublishDate(existingRecipe.publishDate.toISOString().split('T')[0]);
      setDirections(existingRecipe.directions);
      setIngredients(existingRecipe.ingredients);
      setImageUrl(existingRecipe.imageUrl);
      setUploadProgress(-1);
      fileInputRef.current.value = null;
    } else {
      setName('');
      setCategory('');
      setPublishDate('');
      setDirections('');
      setIngredients([]);
      setImageUrl('');
      setUploadProgress(-1);
      fileInputRef.current.value = null;
    }
  }, [existingRecipe]);

  const [name, setName] = React.useState('');
  const [category, setCategory] = React.useState('');
  const [publishDate, setPublishDate] = React.useState(() => {
    const now = new Date().toISOString().split('T')[0];

    return now;
  });
  const [directions, setDirections] = React.useState('');
  const [ingredients, setIngredients] = React.useState([]);
  const [ingredientName, setIngredientName] = React.useState('');
  const [imageUrl, setImageUrl] = React.useState('');
  const [uploadProgress, setUploadProgress] = React.useState(-1);

  const fileInputRef = React.useRef();

  async function handleFileChanged(event) {
    const files = event.target.files;
    const file = files[0];
    const documentId = uuidv4();

    try {
      const downloadUrl = await FirebaseStorageService.uploadFile(
        file,
        `recipes/${documentId}`,
        setUploadProgress
      );

      setImageUrl(downloadUrl);
    } catch (error) {
      setUploadProgress(-1);
      fileInputRef.current.value = null;
      alert(error.message);
      throw error;
    }
  }

  function handleCancelImageClick() {
    fileInputRef.current.value = null;
    setImageUrl('');
    setUploadProgress(-1);
  }

  function handleRecipeFormSubmit(event) {
    event.preventDefault();

    if (ingredients.length === 0) {
      alert('Ingredients cannot be empty. Please add at least 1 ingredient.');
      return;
    }

    if (!imageUrl) {
      alert('Missing recipe image. Please add recipe image.');
      return;
    }

    const isPublished = new Date(publishDate) <= new Date() ? true : false;

    const newRecipe = {
      name,
      category,
      directions,
      publishDate: new Date(publishDate),
      isPublished,
      ingredients,
      imageUrl: imageUrl ? imageUrl : '',
    };

    if (existingRecipe) {
      newRecipe.id = existingRecipe.id;
      handleUpdateRecipe(newRecipe);
    } else {
      handleAddRecipe(newRecipe);
    }
  }

  function handleAddIngredientClick() {
    if (!ingredientName) {
      alert('Missing ingredient field. Please double check.');
      return;
    }

    const ingredient = ingredientName;

    setIngredients([...ingredients, ingredient]);
    setIngredientName('');
  }

  function handleDeleteIngredient(ingredientName) {
    const remainingIngredients = ingredients.filter((ingredient) => {
      return ingredient !== ingredientName;
    });

    setIngredients(remainingIngredients);
  }

  return (
    <form
      onSubmit={handleRecipeFormSubmit}
      className="add-edit-recipe-form-container"
    >
      <h2 className="text-center form-title">
        {existingRecipe ? 'Update The Recipe' : 'Add a New Recipe'}
      </h2>
      <div className="top-form-section">
        <div className="image-input-box">
          Recipe Image
          <br />
          <input
            type="file"
            accept="image/*"
            onChange={handleFileChanged}
            ref={fileInputRef}
            hidden={uploadProgress > -1 || imageUrl}
          />
          {!imageUrl && uploadProgress > -1 ? (
            <div>
              <label htmlFor="file">Upload Progress:</label>
              <progress id="file" value={uploadProgress} max="100">
                {uploadProgress}%
              </progress>
              <span>{uploadProgress}%</span>
            </div>
          ) : null}
          {imageUrl ? (
            <div className="image-preview">
              <img src={imageUrl} alt={imageUrl} className="image" />
              <button
                type="button"
                onClick={handleCancelImageClick}
                className="secondary-button"
              >
                Cancel Image
              </button>
            </div>
          ) : null}
        </div>
        <div className="fields">
          <label className="recipe-label input-label">
            Recipe Name:
            <input
              required
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="input-text"
            />
          </label>
          <label className="recipe-label input-label">
            Category:
            <select
              required
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="select"
            >
              <option value="breadsSandwichesPizza">
                Breads, Sandwiches, and Pizza
              </option>
              <option value="eggsBreakfast">Eggs & Breakfast</option>
              <option value="dessertsBakedGoods">Desserts & Baked Goods</option>
              <option value="fishSeafood">Fish & Seafood</option>
              <option value="vegetables">Vegetables</option>
            </select>
          </label>
          <label className="recipe-label input-label">
            Directions:
            <textarea
              required
              value={directions}
              onChange={(e) => setDirections(e.target.value)}
              className="input-text"
            />
          </label>
          <label className="recipe-label input-label">
            Publish Date:
            <input
              type="date"
              required
              value={publishDate}
              onChange={(e) => setPublishDate(e.target.value)}
              className="input-text"
            />
          </label>
        </div>
      </div>

      <div className="ingredients-list">
        <h3 className="text-center">Ingredients</h3>
        <table className="ingredients-table">
          <thead>
            <tr>
              <th className="table-header">Ingredient</th>
              <th className="table-header">Delete</th>
            </tr>
          </thead>
          <tbody>
            {ingredients && ingredients.length > 0
              ? ingredients.map((ingredient) => {
                  return (
                    <tr key={ingredient}>
                      <td className="table-data text-center">{ingredient}</td>
                      <td className="ingredient-delete-box">
                        <button
                          type="button"
                          className="secondary-button ingredient-delete-button"
                          onClick={() => handleDeleteIngredient(ingredient)}
                        >
                          Delete
                        </button>
                      </td>
                    </tr>
                  );
                })
              : null}
          </tbody>
        </table>
        {ingredients && ingredients.length === 0 ? (
          <h3 className="text-center no-ingredients">
            No Ingredients Added Yet
          </h3>
        ) : null}
        <div className="ingredient-form">
          <label className="ingredient-label">
            Ingredient:
            <input
              type="text"
              value={ingredientName}
              onChange={(e) => setIngredientName(e.target.value)}
              className="input-text"
              placeholder="ex. 1 cup of sugar"
            />
          </label>
          <button
            type="button"
            onClick={handleAddIngredientClick}
            className="primary-button"
          >
            Add Ingredient
          </button>
        </div>
      </div>
      <div className="action-buttons">
        <button type="submit" className="primary-button action-button">
          {existingRecipe ? 'Update Recipe' : 'Create Recipe'}
        </button>
        {existingRecipe ? (
          <>
            <button
              type="button"
              onClick={handleCancelClick}
              className="primary-button action-button"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => handleDeleteRecipe(existingRecipe.id)}
              className="secondary-button action-button"
            >
              Delete
            </button>
          </>
        ) : null}
      </div>
    </form>
  );
}

export default AddEditRecipeForm;
