/**
 * Form rules, mirrored from the backend.
 *
 * WHO DECIDES
 *   The server does, always. Nothing here is a security check - anyone can
 *   skip a browser and post whatever they like, so the models stay the
 *   authority and these rules only save the customer a round-trip.
 *
 *   That makes drift the one real risk: a rule loosened here that the server
 *   still enforces means a form that submits and then fails for no visible
 *   reason. So every rule below names the model it copies, and the messages
 *   are worded the same way the server words them.
 */

/** models/User.js */
export const NAME_MIN = 2;
export const NAME_MAX = 50;
export const PASSWORD_MIN = 6;

/** models/Address.js */
export const PHONE_RE = /^[6-9]\d{9}$/;
export const PIN_RE = /^[1-9]\d{5}$/;

/** models/Product.js */
export const PRODUCT_NAME_MIN = 3;
export const PRODUCT_NAME_MAX = 100;
export const DESCRIPTION_MIN = 10;
export const DESCRIPTION_MAX = 1000;

const isBlank = (v) => !String(v ?? '').trim();

/** @returns {object} field name -> what is wrong, empty when the form is fine */
export const validateRegister = (form) => {
  const errors = {};
  const name = String(form.name || '').trim();

  if (isBlank(name)) errors.name = 'Name is required';
  else if (name.length < NAME_MIN) errors.name = `Name must be at least ${NAME_MIN} characters`;
  else if (name.length > NAME_MAX) errors.name = `Name cannot exceed ${NAME_MAX} characters`;

  if (isBlank(form.email)) errors.email = 'Email is required';
  else if (!/^\S+@\S+\.\S+$/.test(form.email)) errors.email = 'Enter a valid email address';

  if (isBlank(form.password)) errors.password = 'Password is required';
  else if (form.password.length < PASSWORD_MIN)
    errors.password = `Password must be at least ${PASSWORD_MIN} characters`;

  if (form.role === 'seller' && isBlank(form.businessName))
    errors.businessName = 'Business name is required for a seller account';

  return errors;
};

export const validateAddress = (form) => {
  const errors = {};

  if (isBlank(form.phoneNumber)) errors.phoneNumber = 'Phone number is required for delivery';
  else if (!PHONE_RE.test(String(form.phoneNumber).trim()))
    errors.phoneNumber = 'Enter a valid 10-digit mobile number';

  if (isBlank(form.street)) errors.street = 'Street address is required';
  if (isBlank(form.city)) errors.city = 'City is required';
  if (isBlank(form.state)) errors.state = 'State is required';

  if (isBlank(form.zipCode)) errors.zipCode = 'PIN code is required';
  else if (!PIN_RE.test(String(form.zipCode).trim()))
    errors.zipCode = 'Enter a valid 6-digit PIN code';

  return errors;
};

export const validateProduct = (form) => {
  const errors = {};
  const name = String(form.name || '').trim();
  const description = String(form.description || '').trim();

  if (isBlank(name)) errors.name = 'Product name is required';
  else if (name.length < PRODUCT_NAME_MIN)
    errors.name = `Product name must be at least ${PRODUCT_NAME_MIN} characters`;
  else if (name.length > PRODUCT_NAME_MAX)
    errors.name = `Product name cannot exceed ${PRODUCT_NAME_MAX} characters`;

  if (isBlank(description)) errors.description = 'Product description is required';
  else if (description.length < DESCRIPTION_MIN)
    errors.description = `Description must be at least ${DESCRIPTION_MIN} characters`;
  else if (description.length > DESCRIPTION_MAX)
    errors.description = `Description cannot exceed ${DESCRIPTION_MAX} characters`;

  if (isBlank(form.category)) errors.category = 'Choose a category';

  const price = Number(form.price);
  if (isBlank(form.price)) errors.price = 'Price is required';
  else if (!Number.isFinite(price) || price <= 0) errors.price = 'Price must be more than 0';

  const stock = Number(form.stock);
  if (isBlank(form.stock)) errors.stock = 'Stock is required';
  else if (!Number.isInteger(stock) || stock < 0)
    errors.stock = 'Stock must be a whole number, 0 or more';

  // MRP is the struck-through "was" price. Setting it at or below the selling
  // price does not show a discount - it just silently disappears from the
  // listing, and the seller is left wondering why.
  if (!isBlank(form.mrp)) {
    const mrp = Number(form.mrp);
    if (!Number.isFinite(mrp) || mrp <= 0) errors.mrp = 'MRP must be more than 0';
    else if (Number.isFinite(price) && mrp <= price)
      errors.mrp = 'MRP must be higher than the selling price, or left empty';
  }

  if (!isBlank(form.weight)) {
    const weight = Number(form.weight);
    if (!Number.isFinite(weight) || weight < 0.001 || weight > 30)
      errors.weight = 'Weight must be between 0.001 kg and 30 kg';
  }

  return errors;
};

/**
 * Pulls the readable part out of a rejected request.
 *
 * The server answers a failed validation with every broken field in `errors`.
 * Showing only `message` threw the rest away, so a form with three problems
 * reported one and made the seller find the others by guessing.
 */
export const serverMessage = (err, fallback = 'Something went wrong') => {
  const data = err?.response?.data;
  if (Array.isArray(data?.errors) && data.errors.length) return data.errors.join('\n');
  return data?.message || fallback;
};
