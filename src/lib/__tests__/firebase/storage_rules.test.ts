import * as ftest from '@firebase/rules-unit-testing';
import { assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import firebaseApp from 'firebase/compat';
import * as fs from 'fs';
import 'jest';
type Storage = firebaseApp.storage.Storage;

let testEnv: ftest.RulesTestEnvironment;
const userImageRef = (storage: Storage, projectId: string, layerId: string, userId: string, imageName: string) =>
  userImagesRef(storage, projectId, layerId, userId).child(imageName);
const userImagesRef = (storage: Storage, projectId: string, layerId: string, userId: string) =>
  storage.ref(`projects/${projectId}/${layerId}/${userId}`);
const loadIconImage = () => fs.readFileSync('./icon.png');
const loadBigIconImage = () => fs.readFileSync('./big_image.jpg');
//const create500MBImage = () => new Int8Array(5 * 1024);
const contentType = 'image/png';

jest.setTimeout(20000);

beforeAll(async () => {
  testEnv = await ftest.initializeTestEnvironment({
    projectId: 'demo-users-storage-rules-test',
    storage: {
      host: 'localhost',
      port: 9199,
      rules: fs.readFileSync('./storage.rules', 'utf8'),
    },
  });
});
beforeEach(async () => await testEnv.clearStorage());
afterAll(async () => await testEnv.cleanup());

describe('users', () => {
  describe('get', () => {
    describe('if a user is not authenticated', () => {
      const userId = 'user';
      const projectId = 'project';
      const layerId = 'layer';
      beforeEach(async () => {
        await testEnv.withSecurityRulesDisabled(async (context: any) => {
          await userImageRef(context.storage(), projectId, layerId, userId, 'icon.png')
            .put(loadIconImage(), { contentType })
            .then();
        });
      });
      test('cannot get image', async () => {
        await assertFails(
          userImageRef(
            testEnv.unauthenticatedContext().storage(),
            projectId,
            layerId,
            userId,
            'icon.png'
          ).getDownloadURL()
        );
      });
    });
    describe('if a user is authenticated', () => {
      const userId = 'user';
      const projectId = 'project';
      const layerId = 'layer';

      beforeEach(async () => {
        await testEnv.withSecurityRulesDisabled(async (context: any) => {
          await userImageRef(context.storage(), projectId, layerId, userId, 'icon.png').put(loadIconImage());
        });
      });
      describe('try to get user own image', () => {
        test('can get image', async () => {
          const context1 = testEnv.authenticatedContext(userId, {
            email: 'test1@example.com',
            email_verified: true,
          });
          await assertSucceeds(
            userImageRef(context1.storage(), projectId, layerId, userId, 'icon.png').getDownloadURL()
          );
        });
      });
      describe('プロジェクトに関係ない人が画像を取得', () => {
        test('取得できてしまう', async () => {
          const anotherUserId = 'user2';
          const context2 = testEnv.authenticatedContext(anotherUserId, {
            email: 'test2@example.com',
            email_verified: true,
          });
          await assertSucceeds(
            userImageRef(context2.storage(), projectId, layerId, userId, 'icon.png').getDownloadURL()
          );
        });
      });
    });
  });

  describe('list', () => {
    describe('誰もリストを取得できない', () => {
      const userId = 'user';
      const projectId = 'project';
      const layerId = 'layer';

      beforeEach(async () => {
        await testEnv.withSecurityRulesDisabled(async (context: any) => {
          const storage = context.storage();
          await userImageRef(storage, projectId, layerId, userId, 'icon1.png').put(loadIconImage(), { contentType });
          await userImageRef(storage, projectId, layerId, userId, 'icon2.png').put(loadIconImage(), { contentType });
        });
      });
      test('cannot get images', async () => {
        const context1 = testEnv.authenticatedContext(userId, {
          email: 'test1@example.com',
          email_verified: true,
        });
        await assertFails(userImagesRef(context1.storage(), projectId, layerId, userId).listAll());
      });
    });
  });

  describe('create', () => {
    describe('if a user is not authenticated', () => {
      const userId = 'user';
      const projectId = 'project';
      const layerId = 'layer';
      test('cannot put am image', async () => {
        await assertFails(
          userImageRef(testEnv.unauthenticatedContext().storage(), projectId, layerId, userId, 'icon.png')
            .put(loadIconImage(), { contentType })
            .then()
        );
      });
    });

    describe('if a user is authenticated', () => {
      const userId = 'user';
      const projectId = 'project';
      const layerId = 'layer';
      describe('try to put image to user own directory', () => {
        test('can put am image', async () => {
          const context1 = testEnv.authenticatedContext(userId, {
            email: 'test1@example.com',
            email_verified: true,
          });
          await assertSucceeds(
            userImageRef(context1.storage(), projectId, layerId, userId, 'icon.png')
              .put(loadIconImage(), { contentType })
              .then()
          );
        });
      });
      describe("another user tries to put image to user's directory", () => {
        test('cannot put am image', async () => {
          const anotherUserId = 'user2';
          const context2 = testEnv.authenticatedContext(anotherUserId, {
            email: 'test2@example.com',
            email_verified: true,
          });
          await assertFails(
            userImageRef(context2.storage(), projectId, layerId, userId, 'icon.png')
              .put(loadIconImage(), { contentType })
              .then()
          );
        });
      });
      describe('try to put image with 5MB to user own directory', () => {
        test('cannot put am image', async () => {
          const context1 = testEnv.authenticatedContext(userId, {
            email: 'test1@example.com',
            email_verified: true,
          });
          await assertFails(
            userImageRef(context1.storage(), projectId, layerId, userId, 'big_image.jpg')
              .put(loadBigIconImage(), { contentType })
              .then()
          );
        });
      });
      // describe('try to put image with 500MB to user own directory', () => {
      //   test('cannot put am image', async () => {
      //     await assertFails(
      //       userImageRef(testEnv.authenticatedContext(userId).storage(), userId, 'big_icon.png')
      //         .put(create500MBImage(), { contentType })
      //         .then()
      //     );
      //   });
      // });
      describe('try to put image with invalid contentType to user own directory', () => {
        test('cannot put am image', async () => {
          await assertFails(
            userImageRef(testEnv.authenticatedContext(userId).storage(), projectId, layerId, userId, 'icon.png')
              .put(loadIconImage(), { contentType: 'image/tiff' })
              .then()
          );
        });
      });
    });
  });

  describe('update', () => {
    describe('if a user is authenticated', () => {
      const userId = 'user';
      const projectId = 'project';
      const layerId = 'layer';

      beforeEach(async () => {
        await testEnv.withSecurityRulesDisabled(async (context: any) => {
          const storage = context.storage();
          await userImageRef(storage, projectId, layerId, userId, 'icon.png').put(loadIconImage(), { contentType });
        });
      });
      test('cannot update metadata of an image', async () => {
        const context1 = testEnv.authenticatedContext(userId, {
          email: 'test1@example.com',
          email_verified: true,
        });
        await assertFails(userImageRef(context1.storage(), projectId, layerId, userId, 'icon.png').updateMetadata({}));
      });
    });
  });

  describe('delete', () => {
    describe('if a user is authenticated', () => {
      const userId = 'user';
      const projectId = 'project';
      const layerId = 'layer';

      beforeEach(async () => {
        await testEnv.withSecurityRulesDisabled(async (context: any) => {
          const storage = context.storage();
          await userImageRef(storage, projectId, layerId, userId, 'icon.png').put(loadIconImage(), { contentType });
        });
      });
      test('can delete an image', async () => {
        const context1 = testEnv.authenticatedContext(userId, {
          email: 'test1@example.com',
          email_verified: true,
        });
        await assertSucceeds(userImageRef(context1.storage(), projectId, layerId, userId, 'icon.png').delete());
      });
    });
  });
});
