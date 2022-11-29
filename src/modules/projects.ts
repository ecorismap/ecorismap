import produce, { enableES5 } from 'immer';
enableES5();

import { ProjectType } from '../types';

export function createProjectsInitialState(): ProjectType[] {
  return [];
}

export const SET = 'projects/set' as const;
export const ADD = 'projects/add' as const;
export const UPDATE = 'projects/update' as const;
export const DELETE = 'projects/delete' as const;

export const setProjectsAction = (payload: ProjectType[]) => ({ type: SET, value: payload });
export const addProjectAction = (payload: ProjectType) => ({ type: ADD, value: payload });
export const updateProjectAction = (payload: ProjectType) => ({ type: UPDATE, value: payload });
export const deleteProjectAction = (payload: ProjectType) => ({ type: DELETE, value: payload });

export type Action =
  | Readonly<ReturnType<typeof setProjectsAction>>
  | Readonly<ReturnType<typeof addProjectAction>>
  | Readonly<ReturnType<typeof updateProjectAction>>
  | Readonly<ReturnType<typeof deleteProjectAction>>;

const reducer = produce((draft, action: Action) => {
  switch (action.type) {
    case SET: {
      return action.value;
    }
    case ADD:
      draft.push(action.value);
      break;
    case UPDATE: {
      return draft.map((n) => (n.id !== action.value.id ? n : action.value));
    }
    case DELETE: {
      return draft.filter((n) => n.id !== action.value.id);
    }
    default:
      return draft;
  }
}, createProjectsInitialState());
export default reducer;
