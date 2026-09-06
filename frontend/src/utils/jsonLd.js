/**
 * Structured data, safe to put inside a <script> tag.
 *
 * THE BUG THIS FIXES
 *   This was JSON.stringify(jsonLd) written straight into the tag with
 *   dangerouslySetInnerHTML. JSON.stringify escapes quotes and backslashes -
 *   it does NOT escape "<". So a value containing the six characters
 *   </script> closes this tag early, and everything after it is parsed by the
 *   browser as ordinary HTML.
 *
 *   A product NAME goes into this JSON, and a name is free text with no
 *   markup rule on it. A seller calling their product
 *
 *       Ring</script><script>alert(1)</script>
 *
 *   fits inside the 100-character limit and runs their code on the product
 *   page of anybody who opens it. Checked against JSON.stringify before this
 *   was written: it leaves the sequence completely intact.
 *
 *   Escaping the angle brackets as unicode escapes is the standard answer.
 *   They are valid JSON and valid JavaScript, every consumer of the
 *   structured data reads exactly the same value, and the sequence can no
 *   longer close the tag. U+2028 and U+2029 go with them because they are
 *   legal in JSON and are line terminators in JavaScript.
 *
 *   The description field is separately guaranteed markup-free by
 *   backend/utils/safeHtml.js. This must not lean on that: the point is to be
 *   right about whatever it is handed.
 */
export const serialiseJsonLd = (data) =>
  JSON.stringify(data)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
