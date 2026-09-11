class BaseProvider {
  constructor(name) {
    this.name = name;
  }

  async searchPeople() {
    throw new Error(`${this.name} provider does not implement searchPeople()`);
  }

  async searchCompanies() {
    throw new Error(`${this.name} provider does not implement searchCompanies()`);
  }

  async enrichPerson() {
    throw new Error(`${this.name} provider does not implement enrichPerson()`);
  }

  async enrichCompany() {
    throw new Error(`${this.name} provider does not implement enrichCompany()`);
  }

  async getAccountInformation() {
    throw new Error(`${this.name} provider does not implement getAccountInformation()`);
  }

  async findEmail() {
    throw new Error(`${this.name} provider does not implement findEmail()`);
  }

  async verifyEmail() {
    throw new Error(`${this.name} provider does not implement verifyEmail()`);
  }
}

module.exports = BaseProvider;
