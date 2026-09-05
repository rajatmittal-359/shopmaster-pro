/**
 * The shop's category tree.
 *
 * WHY IT LOOKS LIKE THIS, after two attempts that did not work
 *
 *   The first was a collapsible tree widget. The "2 subcategories" toggle sat
 *   ABOVE the name, so you read a count before knowing whose it was, and every
 *   row carried three visible buttons - a hundred and twenty across forty
 *   categories. A table with indentation replaced it: forty rows fit at once,
 *   columns let counts and status line up so the eye can scan down them, and
 *   the hierarchy reads from the indent with no widget at all.
 *
 *   The second kept a permanent form beside the tree with a "parent category"
 *   dropdown, and that is what this file now does differently. A child belongs
 *   to whichever parent you are looking at, so the parent should come from
 *   where you clicked - not from a select box that makes you find the same row
 *   a second time. "Add subcategory" therefore sits on the parent's own row,
 *   at the end of its children, where the new one will appear. It also matters
 *   more than adding a main category, which is the rarer act.
 *
 *   The two creation flows are deliberately different shapes, because the two
 *   tasks are. A subcategory is one field with its parent already decided by
 *   where you clicked, so it opens inline and stays open - adding one usually
 *   means adding a few. A main category is several fields with no home in the
 *   list, and opening it inline pushed the whole table down and lost your
 *   place, so it opens in a dialog.
 *
 * THE RULES THE SHAPE FOLLOWS
 *   Products are listed in subcategories, never in a main category, so a main
 *   category is a container. Its "Products" figure is a rollup of everything
 *   beneath it - the number wanted before deciding whether to touch it. And a
 *   main category cannot be created empty, so that form asks for its first
 *   subcategories in the same breath.
 *
 * Row actions appear on hover on a pointer device, stay put on touch where
 * there is no hover, and are revealed by keyboard focus so tabbing never lands
 * on something invisible. They keep their space while hidden, so a row never
 * jumps as the pointer crosses it.
 */
import { useEffect, useMemo, useState } from 'react';
import Layout from '../../components/common/Layout';
import api from '../../utils/api';
import { useConfirm } from '../../context/confirmContext';
import { toastSuccess, toastError } from '../../utils/toast';
import { ChevronRight, Search, Plus } from 'lucide-react';
import Card from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import Badge from '../../components/ui/Badge';
import EmptyState from '../../components/ui/EmptyState';
import Modal from '../../components/ui/Modal';

const FIELD =
  'border border-gray-300 rounded-lg px-3 py-1.5 text-sm ' +
  'focus:outline focus:outline-2 focus:outline-offset-0 focus:outline-orange-600';

const ACTIONS =
  'flex items-center gap-0.5 justify-end shrink-0 ' +
  'md:opacity-0 md:group-hover:opacity-100 md:group-focus-within:opacity-100 ' +
  'transition-opacity';

/** Small enough that forty rows do not become a scroll. */
const ACTION_BTN = 'px-2 py-1 text-xs';

/** The gutter line that groups children under their parent. */
const Gutter = () => (
  <span aria-hidden="true" className="w-px self-stretch bg-gray-200 ml-2 mr-4" />
);

export default function AdminCategoriesPage() {
  const confirm = useConfirm();

  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [query, setQuery] = useState('');
  const [collapsed, setCollapsed] = useState({});

  const [renaming, setRenaming] = useState(null);
  const [renameValue, setRenameValue] = useState('');

  /** Which main category is having a subcategory added under it. */
  const [addingUnder, setAddingUnder] = useState(null);
  const [subName, setSubName] = useState('');

  const [creatingMain, setCreatingMain] = useState(false);
  const [mainName, setMainName] = useState('');
  const [mainSubs, setMainSubs] = useState(['', '']);

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

  const mains = useMemo(() => categories.filter((c) => !c.parentCategory), [categories]);

  /**
   * Rows in reading order. Searching keeps a main category visible when one of
   * its children matches, because a result with no parent above it is a result
   * you cannot place.
   */
  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    const out = [];

    for (const main of mains) {
      const kids = categories.filter(
        (c) => c.parentCategory && c.parentCategory._id === main._id
      );
      const rollup =
        (main.productCount || 0) + kids.reduce((n, k) => n + (k.productCount || 0), 0);

      const mainHit = !q || main.name.toLowerCase().includes(q);
      const hits = q ? kids.filter((k) => k.name.toLowerCase().includes(q)) : kids;
      if (q && !mainHit && hits.length === 0) continue;

      out.push({ cat: main, isMain: true, kids, products: rollup });

      const open = q ? true : !collapsed[main._id];
      if (open) {
        for (const kid of mainHit ? kids : hits) {
          out.push({ cat: kid, isMain: false, kids: [], products: kid.productCount || 0 });
        }
        // Hidden while searching: the list is filtered, so this row would land
        // somewhere the eye does not expect.
        if (!q) out.push({ addUnder: main });
      }
    }
    return out;
  }, [categories, mains, query, collapsed]);

  const handleAddSub = async (main) => {
    const name = subName.trim();
    if (!name) return setAddingUnder(null);

    try {
      setBusy(true);
      await api.post('/admin/categories', { name, parentCategory: main._id });
      toastSuccess(`Added "${name}" under ${main.name}`);
      setSubName('');
      // Stays open: adding one subcategory usually means adding a few.
      await loadCategories();
    } catch (err) {
      toastError(err.response?.data?.message || 'Could not add it');
    } finally {
      setBusy(false);
    }
  };

  const handleCreateMain = async (e) => {
    e.preventDefault();
    const subs = mainSubs.map((s) => s.trim()).filter(Boolean);

    if (subs.length === 0) {
      toastError('Add at least one subcategory - products are listed in those');
      return;
    }

    try {
      setBusy(true);
      const res = await api.post('/admin/categories', {
        name: mainName.trim(),
        subcategories: subs,
      });
      toastSuccess(res.data.message || 'Category created');
      setMainName('');
      setMainSubs(['', '']);
      setCreatingMain(false);
      await loadCategories();
    } catch (err) {
      toastError(err.response?.data?.message || 'Could not create the category');
    } finally {
      setBusy(false);
    }
  };

  const handleRename = async (cat) => {
    const next = renameValue.trim();
    if (!next || next === cat.name) return setRenaming(null);
    try {
      await api.patch(`/admin/categories/${cat._id}`, { name: next });
      toastSuccess('Renamed');
      setRenaming(null);
      await loadCategories();
    } catch (err) {
      toastError(err.response?.data?.message || 'Could not rename it');
    }
  };

  const toggleActive = async (cat, kids) => {
    if (cat.isActive && kids.length > 0) {
      const sure = await confirm({
        title: `Hide "${cat.name}" and everything under it?`,
        message: `${kids.length} subcategor${kids.length === 1 ? 'y' : 'ies'} and their products stop appearing in the shop.`,
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
      message:
        'This cannot be undone. Hide it instead if you only want it out of the shop for now.',
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
      toastError(err.response?.data?.message || 'Could not delete it');
    }
  };

  return (
    <Layout title="Manage Categories">
      <div className="max-w-4xl space-y-5">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h2 className="text-2xl font-bold">Categories</h2>
            <p className="text-sm text-gray-600 mt-1">
              Sellers list products in subcategories. A main category groups them and
              holds nothing itself.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <div className="relative">
              <Search
                aria-hidden="true"
                size={15}
                className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none"
              />
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Find a category"
                aria-label="Find a category"
                className={`${FIELD} pl-8 w-48`}
              />
            </div>
            <Button variant="secondary" onClick={() => setCreatingMain((v) => !v)}>
              New main category
            </Button>
          </div>
        </div>

        <Card
          title="All categories"
          hint={`${mains.length} main · ${categories.length - mains.length} sub`}
        >
          {loading ? (
            <div className="space-y-1 animate-pulse">
              {[...Array(8)].map((_, i) => (
                <div key={i} className="h-8 bg-gray-100 rounded-lg" />
              ))}
            </div>
          ) : rows.length === 0 ? (
            <EmptyState
              title={query ? `Nothing matches "${query}"` : 'No categories yet'}
              hint={
                query
                  ? 'Try a shorter word.'
                  : 'Create a main category with its subcategories to get started.'
              }
              action={
                query ? (
                  <Button variant="secondary" onClick={() => setQuery('')}>
                    Clear search
                  </Button>
                ) : (
                  <Button variant="primary" onClick={() => setCreatingMain(true)}>
                    New main category
                  </Button>
                )
              }
            />
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-gray-500 border-b border-gray-200">
                  <th className="py-2 font-medium">Category</th>
                  <th className="py-2 px-3 font-medium text-right w-24">Products</th>
                  <th className="py-2 px-3 font-medium w-24">Status</th>
                  <th className="py-2 w-36" />
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  if (row.addUnder) {
                    const main = row.addUnder;
                    const open = addingUnder === main._id;

                    return (
                      <tr key={`add-${main._id}`} className="border-b border-gray-100">
                        <td colSpan={4} className="py-1">
                          {open ? (
                            <span className="flex items-center">
                              <Gutter />
                              <input
                                autoFocus
                                value={subName}
                                onChange={(e) => setSubName(e.target.value)}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') handleAddSub(main);
                                  if (e.key === 'Escape') {
                                    setAddingUnder(null);
                                    setSubName('');
                                  }
                                }}
                                placeholder={`New subcategory under ${main.name}`}
                                className={`${FIELD} w-64`}
                              />
                              <Button
                                variant="primary"
                                className={`${ACTION_BTN} ml-2`}
                                loading={busy}
                                onClick={() => handleAddSub(main)}
                              >
                                Add
                              </Button>
                              <Button
                                variant="ghost"
                                className={ACTION_BTN}
                                onClick={() => {
                                  setAddingUnder(null);
                                  setSubName('');
                                }}
                              >
                                Done
                              </Button>
                            </span>
                          ) : (
                            <span className="flex items-center">
                              <Gutter />
                              <button
                                type="button"
                                onClick={() => {
                                  setAddingUnder(main._id);
                                  setSubName('');
                                }}
                                /*
                                  Deliberately not the ghost Button: its orange
                                  hover background stacked on top of the row's
                                  own hover, and the doubled block read as a
                                  selected row rather than a hovered one. Colour
                                  alone is enough for a quiet affordance.
                                */
                                className="inline-flex items-center gap-1.5 px-2 py-1 rounded-lg text-xs
                                           text-gray-500 hover:text-orange-700 transition-colors
                                           focus-visible:outline focus-visible:outline-2 focus-visible:outline-orange-600"
                              >
                                <Plus size={14} /> Add subcategory
                              </button>
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  }

                  const { cat, isMain, kids, products } = row;
                  const open = !collapsed[cat._id];
                  const blocked =
                    cat.productCount > 0
                      ? `${cat.productCount} product(s) inside`
                      : kids.length > 0
                      ? `${kids.length} subcategor${kids.length === 1 ? 'y' : 'ies'} inside`
                      : null;

                  return (
                    <tr
                      key={cat._id}
                      className="group border-b border-gray-100 hover:bg-gray-50/70"
                    >
                      <td className="py-1">
                        {renaming === cat._id ? (
                          <span className="flex items-center">
                            {!isMain && <Gutter />}
                            <input
                              autoFocus
                              value={renameValue}
                              onChange={(e) => setRenameValue(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') handleRename(cat);
                                if (e.key === 'Escape') setRenaming(null);
                              }}
                              className={`${FIELD} w-64`}
                            />
                            <Button
                              variant="primary"
                              className={`${ACTION_BTN} ml-2`}
                              onClick={() => handleRename(cat)}
                            >
                              Save
                            </Button>
                            <Button
                              variant="ghost"
                              className={ACTION_BTN}
                              onClick={() => setRenaming(null)}
                            >
                              Cancel
                            </Button>
                          </span>
                        ) : isMain ? (
                          <button
                            type="button"
                            onClick={() => setCollapsed({ ...collapsed, [cat._id]: open })}
                            aria-expanded={open}
                            className="flex items-center gap-2 text-left font-semibold py-1 rounded-lg
                                       focus-visible:outline focus-visible:outline-2 focus-visible:outline-orange-600"
                          >
                            <ChevronRight
                              aria-hidden="true"
                              size={16}
                              className={`text-gray-400 shrink-0 transition-transform duration-150 ${
                                open ? 'rotate-90' : ''
                              }`}
                            />
                            <span className={cat.isActive ? 'text-gray-900' : 'text-gray-400'}>
                              {cat.name}
                            </span>
                            <span className="font-normal text-xs text-gray-500">
                              {kids.length} sub
                            </span>
                            {kids.length === 0 && (
                              <Badge tone="warning">Needs a subcategory</Badge>
                            )}
                          </button>
                        ) : (
                          <span className="flex items-center py-1">
                            <Gutter />
                            <span className={cat.isActive ? 'text-gray-700' : 'text-gray-400'}>
                              {cat.name}
                            </span>
                          </span>
                        )}
                      </td>

                      <td className="py-1 px-3 text-right tabular-nums text-gray-600">
                        {products || <span className="text-gray-300">0</span>}
                      </td>

                      <td className="py-1 px-3">
                        {/*
                          Live is the normal state, so it says so quietly with a
                          dot. Hidden is the exception and the only thing that
                          earns a badge - otherwise forty rows of pills become
                          wallpaper and neither state stands out.
                        */}
                        {cat.isActive ? (
                          <span className="inline-flex items-center gap-1.5 text-xs text-gray-500">
                            <span
                              aria-hidden="true"
                              className="w-1.5 h-1.5 rounded-full bg-green-500"
                            />
                            Live
                          </span>
                        ) : (
                          <Badge tone="neutral">Hidden</Badge>
                        )}
                      </td>

                      <td className="py-1">
                        {renaming !== cat._id && (
                          <div className={ACTIONS}>
                            <Button
                              variant="ghost"
                              className={ACTION_BTN}
                              onClick={() => {
                                setRenaming(cat._id);
                                setRenameValue(cat.name);
                              }}
                            >
                              Rename
                            </Button>
                            <Button
                              variant="ghost"
                              className={ACTION_BTN}
                              onClick={() => toggleActive(cat, kids)}
                            >
                              {cat.isActive ? 'Hide' : 'Show'}
                            </Button>
                            <Button
                              variant="ghost"
                              disabled={!!blocked}
                              title={blocked ? `Cannot delete: ${blocked}` : undefined}
                              className={`${ACTION_BTN} ${
                                blocked ? '' : 'hover:text-red-700 hover:bg-red-50'
                              }`}
                              onClick={() => handleDelete(cat)}
                            >
                              Delete
                            </Button>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </Card>

        {/*
          A dialog rather than an inline panel: this form has several fields
          and no natural home in the list, and opening it inline pushed the
          whole table down. Adding a SUBcategory stays inline, because there
          the parent row is the context.
        */}
        <Modal
          open={creatingMain}
          title="New main category"
          hint="Products go in its subcategories, so it needs at least one."
          onClose={() => setCreatingMain(false)}
        >
          <form onSubmit={handleCreateMain} className="space-y-4">
            <label className="block">
              <span className="text-sm font-medium text-gray-700">Name</span>
              <input
                autoFocus
                required
                value={mainName}
                onChange={(e) => setMainName(e.target.value)}
                placeholder="Jewellery"
                className={`mt-1 ${FIELD} w-full`}
              />
            </label>

            <div>
              <span className="text-sm font-medium text-gray-700">Subcategories</span>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-2">
                {mainSubs.map((value, i) => (
                  <input
                    key={i}
                    value={value}
                    onChange={(e) => {
                      const next = [...mainSubs];
                      next[i] = e.target.value;
                      setMainSubs(next);
                    }}
                    placeholder={i === 0 ? 'Rings' : 'Earrings'}
                    className={FIELD}
                  />
                ))}
              </div>
              <button
                type="button"
                onClick={() => setMainSubs([...mainSubs, ''])}
                className="inline-flex items-center gap-1.5 mt-2 px-2 py-1 -ml-2 rounded-lg text-xs
                           text-gray-500 hover:text-orange-700 transition-colors
                           focus-visible:outline focus-visible:outline-2 focus-visible:outline-orange-600"
              >
                <Plus size={14} /> Add another
              </button>
            </div>

            <div className="flex gap-2 pt-1">
              <Button type="submit" variant="primary" loading={busy} loadingText="Creating…">
                Create category
              </Button>
              <Button type="button" variant="ghost" onClick={() => setCreatingMain(false)}>
                Cancel
              </Button>
            </div>
          </form>
        </Modal>
      </div>
    </Layout>
  );
}
