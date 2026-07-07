## Summary
<!-- Brief description of what this PR does -->

## Type of Change
- [ ] Bug fix
- [ ] New feature
- [ ] Breaking change
- [ ] Database migration
- [ ] Hotfix

## Related Issue / Request
<!-- Mention user request or issue -->

## Changes Made
<!-- List the key files changed and what changed -->

## Testing Done
- [ ] Tested locally on localhost
- [ ] Tested on staging (staging-bknrerp.onrender.com)
- [ ] All existing features still work
- [ ] No console errors

## Database
- [ ] No DB changes
- [ ] Migration created (`alembic revision --autogenerate`)
- [ ] Migration has `downgrade()` implemented
- [ ] Migration tested: upgrade → downgrade → upgrade

## Pre-Merge Checklist
- [ ] Staging deploy verified
- [ ] DB backup taken (if merging to main): `bash scripts/backup_db.sh`
- [ ] Git tag will be created after merge: `bash scripts/release.sh X.Y.Z`
- [ ] Feature flags set correctly for phased rollout (if applicable)

## Rollback Plan
<!-- If something goes wrong, how do we rollback? -->
```bash
git checkout vX.Y.Z   # previous version tag
# Re-deploy from Render dashboard
```
