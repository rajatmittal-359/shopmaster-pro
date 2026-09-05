/**
 * The shop's category tree.
 *
 * WHAT WAS WRONG WITH THE OLD SCREEN
 *   Forty categories rendered as one flat alphabetical list, so a subcategory
 *   sat above its own parent and the only clue about the hierarchy was buried
 *   in the description text ("Backpacks - part of Bags & Luggage"). There was
 *   no way to rename anything, no product counts, so Delete was a guess - and
 *   the helper text was written in Hinglish.
 *
 * THE SHAPE OF THE THING, which the form now follows
 *   Products are listed in subcategories, never in a main category (see
 *   sellerController.validateLeafCategory). A main category is therefore a
 *   container, and one created on its own is a heading nothing can go under.
 *   So creating a main category asks for its subcategories in the same breath,
 *   and the server refuses a main category with none.
 */
import { useEffect, useState } from 'react';
import Layout from '../../components/common/Layout';
import api from '../../utils/api';
import { useConfirm } from '../../context/confirmContext';
import { toastSuccess, toastError } from '../../utils/toast';
import Card from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import Badge from '../../components/ui/Badge';
import EmptyState from '../../components/ui/EmptyState';

const FIELD =
  'w-full border border-gray-300 rounded px-3 py-2 text-sm ' +
  'focus:outline focus:outline-2 focus:outline-offset-0 focus:outline-orange-600';

export default function AdminCategoriesPage() {
  const confirm = useConfirm();

  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  /** 'main' asks for subcategories; 'sub' asks for a parent. */
  const [kind, setKind] = useState('main');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [parentCategory, setParentCategory] = useState('');
  const [subNames, setSubNames] = useState(['']);

  const [expanded, setExpanded] = useState({});
  const [renaming, setRenaming] = useState(null);
  const [renameValue, setRenameValue] = useState('');

  const loadCategories = async () => {
    try {
      setLoading(true);
      const res = await api.get('/admin/categories');
      setCategories(res.data.categories || []);
    } catch (err) {
      console.error(err);
      toastError('Could not load categories');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadCategories();
  }, []);

  const mains = categories.filter((c) => !c.parentCategory);
  const childrenOf = (id) =>
    categories.filter((c) => c.parentCategory && c.parentCategory._id === id);

  const resetForm = () => {
    setName('');
    setDescription('');
    setParentCategory('');
    setSubNames(['']);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    const subs = subNames.map((s) => s.trim()).filter(Boolean);
    if (kind === 'main' && subs.length === 0) {
      toastError('Add at least one subcategory - products are listed in those, not in the main category');
      return;
    }

    try {
      setSaving(true);
      const res = await api.post('/admin/categories', {
        name: name.trim(),
        description: description.trim(),
        parentCategory: kind === 'sub' ? parentCategory : null,
        ...(kind === 'main' ? { subcategories: subs } : {}),
      });
      toastSuccess(res.data.message || 'Category created');
      resetForm();
      await loadCategories();
    } catch (err) {
      toastError(err.response?.data?.message || 'Could not create the category');
    } finally {
      setSaving(false);
    }
  };

  const handleRename = async (cat) => {
    const next = renameValue.trim();
    if (!next || next === cat.name) {
      setRenaming(null);
      return;
    }
    try {
      await api.patch(`/admin/categories/${cat._id}`, { name: next });
      toastSuccess('Renamed');
      setRenaming(null);
      await loadCategories();
    } catch (err) {
      toastError(err.response?.data?.message || 'Could not rename it');
    }
  };

  const toggleActive = async (cat) => {
    // Switching off a main category hides everything beneath it, which is not
    // obvious from a toggle. Say so before it happens.
    const kids = childrenOf(cat._id);
    if (cat.isActive && kids.length > 0) {
      const sure = await confirm({
        title: `Hide "${cat.name}" and everything under it?`,
        message: `${kids.length} subcategor${kids.length === 1 ? 'y' : 'ies'} and their products will stop appearing in the shop.`,
        confirmLabel: 'Hide it',
        cancelLabel: 'Leave it on',
      });
      if (!sure) return;
    }

    try {
      await api.patch(`/admin/categories/${cat._id}`, { isActive: !cat.isActive });
      await loadCategories();
    } catch (err) {
      toastError(err.response?.data?.message || 'Could not change it');
    }
  };

  const handleDelete = async (cat) => {
    const sure = await confirm({
      title: `Delete "${cat.name}"?`,
      message: 'This cannot be undone. Deactivate it instead if you only want it out of the shop for now.',
      confirmLabel: 'Delete category',
      cancelLabel: 'Keep it',
      danger: true,
    });
    if (!sure) return;

    try {
      await api.delete(`/admin/categories/${cat._id}`);
      toastSuccess('Category deleted');
      await loadCategories();
    } catch (err) {
      // The server refuses while products or subcategories are still inside.
      toastError(err.response?.data?.message || 'Could not delete it');
    }
  };

  /** One row, used for both levels. */
  const CategoryRow = ({ cat, isMain }) => {
    const kids = isMain ? childrenOf(cat._id) : [];
    const blocked =
      cat.productCount > 0
        ? `${cat.productCount} product(s) inside`
        : kids.length > 0
        ? `${kids.length} subcategor${kids.length === 1 ? 'y' : 'ies'} inside`
        : null;

    return (
      <div className={isMain ? '' : 'pl-6 border-l-2 border-gray-100 ml-2'}>
        <div className="flex flex-wrap items-center gap-3 py-2.5">
          <div className="flex-1 min-w-0">
            {renaming === cat._id ? (
              <div className="flex gap-2">
                <input
                  autoFocus
                  value={renameValue}
                  onChange={(e) => setRenameValue(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleRename(cat);
                    if (e.key === 'Escape') setRenaming(null);
                  }}
                  className={FIELD + ' max-w-xs'}
                />
                <Button size="sm" variant="primary" onClick={() => handleRename(cat)}>
                  Save
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setRenaming(null)}>
                  Cancel
                </Button>
              </div>
            ) : (
              <div className="flex items-center gap-2 flex-wrap">
                <span
                  className={`${isMain ? 'font-semibold' : ''} ${
                    cat.isActive ? 'text-gray-900' : 'text-gray-400'
                  }`}
                >
                  {cat.name}
                </span>

                {!cat.isActive && <Badge tone="neutral">Hidden</Badge>}

                <span className="text-xs text-gray-500">
                  {cat.productCount === 0
                    ? isMain
                      ? ''
                      : 'no products'
                    : `${cat.productCount} product${cat.productCount === 1 ? '' : 's'}`}
                </span>

                {/* A main category with nothing under it is a dead end. */}
                {isMain && kids.length === 0 && (
                  <Badge tone="warning">Needs a subcategory</Badge>
                )}
              </div>
            )}
          </div>

          {renaming !== cat._id && (
            <div className="flex items-center gap-1 shrink-0">
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  setRenaming(cat._id);
                  setRenameValue(cat.name);
                }}
              >
                Rename
              </Button>
              <Button size="sm" variant="ghost" onClick={() => toggleActive(cat)}>
                {cat.isActive ? 'Hide' : 'Show'}
              </Button>
              <Button
                size="sm"
                variant="destructive"
                disabled={!!blocked}
                title={blocked ? `Cannot delete: ${blocked}` : undefined}
                onClick={() => handleDelete(cat)}
              >
                Delete
              </Button>
            </div>
          )}
        </div>

        {isMain && expanded[cat._id] && (
          <div className="pb-2">
            {kids.length === 0 ? (
              <p className="pl-6 py-2 text-sm text-gray-500">
                Nothing can be listed here until this has a subcategory.
              </p>
            ) : (
              kids.map((kid) => <CategoryRow key={kid._id} cat={kid} isMain={false} />)
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    <Layout title="Manage Categories">
      <div className="space-y-6">
        <div>
          <h2 className="text-2xl font-bold">Categories</h2>
          <p className="text-sm text-gray-600 mt-1">
            Products are listed in subcategories. A main category groups them and holds
            nothing itself.
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
          {/* ------------------------------------------------------- create */}
          <Card title="Add a category" className="lg:col-span-1">
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="flex gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant={kind === 'main' ? 'primary' : 'secondary'}
                  onClick={() => setKind('main')}
                >
                  Main category
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant={kind === 'sub' ? 'primary' : 'secondary'}
                  onClick={() => setKind('sub')}
                >
                  Subcategory
                </Button>
              </div>

              <label className="block">
                <span className="text-sm text-gray-700">Name</span>
                <input
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className={`mt-1 ${FIELD}`}
                  placeholder={kind === 'main' ? 'Jewellery' : 'Earrings'}
                />
              </label>

              {kind === 'sub' && (
                <label className="block">
                  <span className="text-sm text-gray-700">Goes under</span>
                  <select
                    required
                    value={parentCategory}
                    onChange={(e) => setParentCategory(e.target.value)}
                    className={`mt-1 ${FIELD}`}
                  >
                    <option value="">Choose a main category</option>
                    {mains.map((m) => (
                      <option key={m._id} value={m._id}>
                        {m.name}
                      </option>
                    ))}
                  </select>
                </label>
              )}

              {kind === 'main' && (
                <div>
                  <span className="text-sm text-gray-700">Subcategories</span>
                  <p className="text-xs text-gray-500 mt-0.5 mb-2">
                    At least one. Sellers list their products in these.
                  </p>
                  <div className="space-y-2">
                    {subNames.map((value, i) => (
                      <input
                        key={i}
                        value={value}
                        onChange={(e) => {
                          const next = [...subNames];
                          next[i] = e.target.value;
                          setSubNames(next);
                        }}
                        className={FIELD}
                        placeholder={i === 0 ? 'Rings' : 'Another subcategory'}
                      />
                    ))}
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="mt-2"
                    onClick={() => setSubNames([...subNames, ''])}
                  >
                    Add another
                  </Button>
                </div>
              )}

              <label className="block">
                <span className="text-sm text-gray-700">
                  Description <span className="text-gray-400">(optional)</span>
                </span>
                <textarea
                  rows={2}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className={`mt-1 ${FIELD}`}
                />
              </label>

              <Button
                type="submit"
                variant="primary"
                fullWidth
                loading={saving}
                loadingText="Creating…"
              >
                {kind === 'main' ? 'Create category and subcategories' : 'Create subcategory'}
              </Button>
            </form>
          </Card>

          {/* --------------------------------------------------------- tree */}
          <Card
            title="Category tree"
            hint={`${mains.length} main, ${categories.length - mains.length} sub`}
            className="lg:col-span-2"
            actions={
              <Button
                size="sm"
                variant="secondary"
                onClick={() =>
                  setExpanded(
                    Object.keys(expanded).length === mains.length
                      ? {}
                      : Object.fromEntries(mains.map((m) => [m._id, true]))
                  )
                }
              >
                {Object.keys(expanded).length === mains.length ? 'Collapse all' : 'Expand all'}
              </Button>
            }
          >
            {loading ? (
              <div className="space-y-2 animate-pulse">
                {[...Array(5)].map((_, i) => (
                  <div key={i} className="h-10 bg-gray-100 rounded" />
                ))}
              </div>
            ) : mains.length === 0 ? (
              <EmptyState
                title="No categories yet"
                hint="Create a main category with its subcategories to get started."
              />
            ) : (
              <div className="divide-y divide-gray-100">
                {mains.map((m) => {
                  const kids = childrenOf(m._id);
                  const open = !!expanded[m._id];

                  return (
                    <div key={m._id}>
                      <button
                        type="button"
                        onClick={() => setExpanded({ ...expanded, [m._id]: !open })}
                        className="w-full flex items-center gap-2 pt-3 text-left
                                   focus-visible:outline focus-visible:outline-2 focus-visible:outline-orange-600"
                        aria-expanded={open}
                      >
                        <span
                          aria-hidden="true"
                          className={`text-gray-400 transition-transform ${open ? 'rotate-90' : ''}`}
                        >
                          ▸
                        </span>
                        <span className="text-xs text-gray-500">
                          {kids.length} subcategor{kids.length === 1 ? 'y' : 'ies'}
                        </span>
                      </button>
                      <CategoryRow cat={m} isMain />
                    </div>
                  );
                })}
              </div>
            )}
          </Card>
        </div>
      </div>
    </Layout>
  );
}
