import reducer, { addProjectAction, deleteProjectAction, setProjectsAction, updateProjectAction } from '../projects';
import { ProjectType } from '../../types';

describe('modules/project', () => {
  const state: ProjectType[] = [
    {
      id: '0',
      name: 'test0 project',
      ownerUid: '0123',
      adminsUid: ['0123'],
      members: [{ uid: '0123', email: 'abc@test.com', verified: 'OK', role: 'OWNER' }],
      membersUid: ['0123'],
      abstract: 'this is test0 project',
      storage: { count: 0 },
      license: 'Free',
    },
  ];
  test('should set the project to state', () => {
    const projects: ProjectType[] = [
      {
        id: '1',
        name: 'test1 project',
        ownerUid: '4567',
        adminsUid: ['4567'],
        membersUid: ['4567'],
        members: [{ uid: '4567', email: 'def@test.com', verified: 'OK', role: 'OWNER' }],
        abstract: 'this is test1 project',
        storage: { count: 0 },
        license: 'Free',
      },
    ];

    const action = setProjectsAction(projects);
    expect(reducer(state, action)).toEqual(projects);
  });
  test('should added the project to state', () => {
    const project: ProjectType = {
      id: '1',
      name: 'test1 project',
      ownerUid: '4567',
      adminsUid: ['4567'],
      membersUid: ['4567'],
      members: [{ uid: '4567', email: 'def@test.com', verified: 'OK', role: 'OWNER' }],
      abstract: 'this is test1 project',
      storage: { count: 0 },
      license: 'Free',
    };
    const action = addProjectAction(project);
    expect(reducer(state, action)).toEqual([...state, project]);
  });

  test('should update the project at state.', () => {
    const project: ProjectType = {
      id: '0',
      name: 'test0 project',
      ownerUid: '0123',
      adminsUid: ['0123'],
      members: [{ uid: '0123', email: 'abc@test.com', verified: 'OK', role: 'OWNER' }],
      membersUid: ['0123'],
      abstract: 'this is test0 project',
      storage: { count: 0 },
      license: 'Free',
    };
    const action = updateProjectAction(project);
    expect(reducer(state, action)).toEqual([project]);
  });
  test('should delete the project from state.', () => {
    const project: ProjectType = {
      id: '0',
      name: 'test0 project',
      ownerUid: '0123',
      adminsUid: ['0123'],
      members: [{ uid: '0123', email: 'abc@test.com', verified: 'OK', role: 'OWNER' }],
      membersUid: ['0123'],
      abstract: 'this is test0 project',
      storage: { count: 0 },
      license: 'Free',
    };
    const action = deleteProjectAction(project);
    expect(reducer(state, action)).toEqual([]);
  });
});
