export class ForbiddenError extends Error {
  constructor(msg = "You do not have permission to perform this action") {
    super(msg);
    this.name = "ForbiddenError";
  }
}
