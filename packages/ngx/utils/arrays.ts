// chunk array to a certain size
export const arrayToChunks = (list: any[], size: number) => {
  list = [...list];

  return [...Array(Math.ceil(list.length / size))].map((_) => list.splice(0, size));
};
