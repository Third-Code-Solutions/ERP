import assert from 'node:assert/strict'
import test from 'node:test'
import {
  DOCUMENTS_BUCKET_ALLOWED_MIME_TYPES,
  DOCUMENTS_BUCKET_MAX_BYTES,
  browserSignedUploadIsDenied,
  browserStoragePoliciesAreDenied,
  verifyDocumentsBucket,
} from './verify-hosted-documents-storage.mjs'

test('verifies the approved private documents bucket policy exactly', () => {
  assert.deepEqual(
    verifyDocumentsBucket({
      public: false,
      file_size_limit: DOCUMENTS_BUCKET_MAX_BYTES,
      allowed_mime_types: [...DOCUMENTS_BUCKET_ALLOWED_MIME_TYPES].reverse(),
    }),
    { private: true, exactLimit: true, exactMimeTypes: true }
  )
})

test('requires no hosted Storage RLS policy that grants the documents bucket to browsers', () => {
  assert.equal(browserStoragePoliciesAreDenied([]), true)
  assert.equal(
    browserStoragePoliciesAreDenied([
      {
        policyname: 'documents_tenant_insert',
        roles: ['authenticated'],
        qual: "bucket_id = 'documents'",
        with_check: "bucket_id = 'documents'",
      },
    ]),
    false,
  )
  assert.equal(
    browserStoragePoliciesAreDenied([
      {
        policyname: 'avatars_read',
        roles: ['authenticated'],
        qual: "bucket_id = 'avatars'",
        with_check: null,
      },
    ]),
    true,
  )
  assert.equal(
    browserStoragePoliciesAreDenied([
      { policyname: 'unscoped_write', roles: ['anon'], qual: 'true', with_check: 'true' },
    ]),
    false,
  )
})

test('rejects public, over-limit, or broad MIME documents buckets', () => {
  assert.deepEqual(
    verifyDocumentsBucket({
      public: true,
      file_size_limit: 50 * 1024 * 1024,
      allowed_mime_types: ['application/pdf'],
    }),
    { private: false, exactLimit: false, exactMimeTypes: false }
  )
})

test('recognizes returned and thrown anonymous signed-upload denials', async () => {
  const returnedDenial = {
    storage: {
      from: () => ({ createSignedUploadUrl: async () => ({ data: null, error: new Error('denied') }) }),
    },
  }
  const thrownDenial = {
    storage: {
      from: () => ({ createSignedUploadUrl: async () => { throw new Error('denied') } }),
    },
  }
  const grantedCredential = {
    storage: {
      from: () => ({ createSignedUploadUrl: async () => ({ data: { token: 'unexpected' }, error: null }) }),
    },
  }

  assert.equal(await browserSignedUploadIsDenied(returnedDenial, 'proof.txt'), true)
  assert.equal(await browserSignedUploadIsDenied(thrownDenial, 'proof.txt'), true)
  assert.equal(await browserSignedUploadIsDenied(grantedCredential, 'proof.txt'), false)
})
