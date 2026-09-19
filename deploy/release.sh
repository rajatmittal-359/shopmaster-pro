#!/usr/bin/env bash
# Release one image tag on the box, with a way back (20 Sep 2026).
#
#   ./release.sh <tag>        pull api+web at <tag>, start, wait for both health
#                             checks; on failure roll back to the last good tag
#   ./release.sh rollback     go back to the last good tag by hand
#
# Called by .github/workflows/deploy.yml over SSH after images are pushed;
# usable by hand from the Lightsail terminal too. The last tag that passed
# health is remembered in .last_good, so a bad build never becomes "current".
set -euo pipefail
cd "$(dirname "$0")"

TAG="${1:?usage: release.sh <tag>|rollback}"
if [ "$TAG" = "rollback" ]; then
  TAG="$(cat .last_good 2>/dev/null || true)"
  [ -n "$TAG" ] || { echo "no .last_good to roll back to"; exit 1; }
  echo "▸ rolling back to $TAG"
fi

set_tag() { sed -i "s/^TAG=.*/TAG=$1/" .env; }
healthy() {
  # Both containers report healthy within ~90 s, or it did not work.
  for _ in $(seq 1 30); do
    a=$(docker inspect -f '{{.State.Health.Status}}' shopmaster-api-1 2>/dev/null || echo none)
    w=$(docker inspect -f '{{.State.Health.Status}}' shopmaster-web-1 2>/dev/null || echo none)
    [ "$a" = healthy ] && [ "$w" = healthy ] && return 0
    sleep 3
  done
  return 1
}

PREV="$(grep '^TAG=' .env | cut -d= -f2)"
echo "▸ release $TAG (current $PREV)"
set_tag "$TAG"
docker compose pull --quiet
docker compose up -d --remove-orphans

if healthy; then
  echo "$TAG" > .last_good
  echo "✓ $TAG is live"
  # Keep the disk clean: images older than the last two releases go.
  docker image prune -f >/dev/null 2>&1 || true
  exit 0
fi

echo "✗ $TAG did not become healthy - logs:"
docker compose logs --tail=40 api web || true
LAST="$(cat .last_good 2>/dev/null || echo "$PREV")"
if [ -n "$LAST" ] && [ "$LAST" != "$TAG" ]; then
  echo "▸ rolling back to $LAST"
  set_tag "$LAST"
  docker compose up -d --remove-orphans
  healthy && echo "✓ back on $LAST" || echo "✗ rollback also unhealthy - look at the logs above"
fi
exit 1
